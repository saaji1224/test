import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

interface AddonsOutput {
  vpcCniAddonId: pulumi.Output<string>;
  corednsAddonId: pulumi.Output<string>;
  kubeProxyAddonId: pulumi.Output<string>;
  ebsAddonId: pulumi.Output<string>;
}

export function createAddons(eksOutput: any): AddonsOutput {
  const config = new pulumi.Config();
  const environment = config.require("environment");

  // Get the cluster name
  const clusterName = eksOutput.clusterName;

  // VPC CNI Addon
  const vpcCniAddon = new aws.eks.Addon(`${environment}-vpc-cni-addon`, {
    clusterName: clusterName,
    addonName: "vpc-cni",
    addonVersion: "v1.14.1-eksbuild.1",
    serviceAccountRoleArn: pulumi.interpolate`arn:aws:iam::${aws.getCallerIdentity().then(
      (id) => id.accountId
    )}:role/${environment}-vpc-cni-role`,
    tags: {
      Environment: environment,
    },
  });

  // CoreDNS Addon
  const corednsAddon = new aws.eks.Addon(`${environment}-coredns-addon`, {
    clusterName: clusterName,
    addonName: "coredns",
    addonVersion: "v1.9.3-eksbuild.2",
    tags: {
      Environment: environment,
    },
  });

  // kube-proxy Addon
  const kubeProxyAddon = new aws.eks.Addon(`${environment}-kube-proxy-addon`, {
    clusterName: clusterName,
    addonName: "kube-proxy",
    addonVersion: "v1.28.1-eksbuild.1",
    tags: {
      Environment: environment,
    },
  });

  // EBS CSI Driver Addon
  const ebsAddon = new aws.eks.Addon(`${environment}-ebs-csi-addon`, {
    clusterName: clusterName,
    addonName: "aws-ebs-csi-driver",
    addonVersion: "v1.20.0-eksbuild.1",
    serviceAccountRoleArn: pulumi.interpolate`arn:aws:iam::${aws.getCallerIdentity().then(
      (id) => id.accountId
    )}:role/${environment}-ebs-csi-role`,
    tags: {
      Environment: environment,
    },
  });

  return {
    vpcCniAddonId: vpcCniAddon.id,
    corednsAddonId: corednsAddon.id,
    kubeProxyAddonId: kubeProxyAddon.id,
    ebsAddonId: ebsAddon.id,
  };
}