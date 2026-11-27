import * as cdk from "aws-cdk-lib";
import { BansheeStack } from "../lib/banshee-stack";

const app = new cdk.App();
new BansheeStack(app, "BansheeKiroweenStack", {
  description: "Banshee Kiroween 2026 — Space-Weather GPS Early Warning Serverless Stack",
});
