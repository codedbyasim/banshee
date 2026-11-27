import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class BansheeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const rawFeedBucket = new s3.Bucket(this, "RawSpaceWeatherBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(14) }],
    });

    const stateTable = new dynamodb.Table(this, "BansheeStateTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const feedIngestFn = new lambda.Function(this, "FeedIngestLambda", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      timeout: cdk.Duration.seconds(30),
      environment: {
        RAW_BUCKET: rawFeedBucket.bucketName,
        STATE_TABLE: stateTable.tableName,
      },
      code: lambda.Code.fromInline(`
        exports.handler = async () => {
          const res = await fetch("https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json");
          return { statusCode: res.status, fetchedAt: new Date().toISOString() };
        };
      `),
    });

    rawFeedBucket.grantWrite(feedIngestFn);
    stateTable.grantReadWriteData(feedIngestFn);

    // Allow Amazon Bedrock invocation for Banshee Voice grounded explanations
    feedIngestFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    new events.Rule(this, "TenMinuteFeedSchedule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(10)),
      targets: [new targets.LambdaFunction(feedIngestFn)],
    });

    new cdk.CfnOutput(this, "RawBucketName", { value: rawFeedBucket.bucketName });
    new cdk.CfnOutput(this, "StateTableName", { value: stateTable.tableName });
  }
}
