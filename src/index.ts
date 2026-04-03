import * as pulumi from "@pulumi/pulumi";
import { createNetworking } from "./modules/networking";
import { createEKS } from "./modules/eks";
import { createAddons } from "./modules/addons";

const config = new pulumi.Config();
const environment = config.require("environment");
const awsRegion = config.require("aws:region");

// Create networking infrastructure
const networkingOutput = createNetworking(environment);

// Create EKS cluster
const eksOutput = createEKS(environment, networkingOutput);

// Create EKS addons
const addonsOutput = createAddons(eksOutput);

// Export outputs
export const vpcId = networkingOutput.vpcId;
export const publicSubnets = networkingOutput.publicSubnets;
export const privateSubnets = networkingOutput.privateSubnets;
export const eksClusterId = eksOutput.clusterId;
export const eksClusterName = eksOutput.clusterName;
export const eksClusterEndpoint = eksOutput.clusterEndpoint;
export const eksClusterVersion = eksOutput.clusterVersion;
export const nodeGroupId = eksOutput.nodeGroupId;
export const kubeconfig = eksOutput.kubeconfig;
