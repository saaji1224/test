import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { NetworkingOutput } from "../networking";

interface EKSOutput {
  clusterId: pulumi.Output<string>;
  clusterName: pulumi.Output<string>;
  clusterEndpoint: pulumi.Output<string>;
  clusterVersion: pulumi.Output<string>;
  nodeGroupId: pulumi.Output<string>;
  kubeconfig: pulumi.Output<string>;
}

export function createEKS(environment: string, networking: any): EKSOutput {
  const config = new pulumi.Config();
  const eksVersion = config.require("eks_version");
  const nodeInstanceTypes = config.require("node_instance_types");
  const desiredCapacity = config.getNumber("desired_capacity") || 3;
  const minSize = config.getNumber("min_size") || 1;
  const maxSize = config.getNumber("max_size") || 10;

  // Create IAM role for EKS cluster
  const eksClusterRole = new aws.iam.Role(`${environment}-eks-cluster-role`, {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Service: "eks.amazonaws.com",
          },
          Action: "sts:AssumeRole",
        },
      ],
    }),
    tags: {
      Name: `${environment}-eks-cluster-role`,
      Environment: environment,
    },
  });

  // Attach EKS cluster policy
  new aws.iam.RolePolicyAttachment(`${environment}-eks-cluster-policy`, {
    role: eksClusterRole.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
  });

  // Attach VPC resource controller policy
  new aws.iam.RolePolicyAttachment(`${environment}-eks-vpc-controller`, {
    role: eksClusterRole.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController",
  });

  // Security group for EKS cluster
  const clusterSecurityGroup = new aws.ec2.SecurityGroup(`${environment}-eks-cluster-sg`, {
    vpcId: networking.vpcId,
    description: "Security group for EKS cluster",
    ingress: [
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: `${environment}-eks-cluster-sg`,
      Environment: environment,
    },
  });

  // Create EKS cluster
  const eksCluster = new aws.eks.Cluster(`${environment}-eks`, {
    name: `${environment}-eks-cluster`,
    version: eksVersion,
    roleArn: eksClusterRole.arn,
    vpcConfig: {
      subnetIds: pulumi
        .all([networking.publicSubnets, networking.privateSubnets])
        .apply(([publicSubnets, privateSubnets]) => [
          ...publicSubnets.map((s: any) => s.id),
          ...privateSubnets.map((s: any) => s.id),
        ]),
      securityGroupIds: [clusterSecurityGroup.id],
      endpointPrivateAccess: true,
      endpointPublicAccess: true,
    },
    enabledClusterLogTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"],
    tags: {
      Name: `${environment}-eks-cluster`,
      Environment: environment,
    },
  });

  // Create IAM role for node group
  const nodeGroupRole = new aws.iam.Role(`${environment}-eks-node-role`, {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Service: "ec2.amazonaws.com",
          },
          Action: "sts:AssumeRole",
        },
      ],
    }),
    tags: {
      Name: `${environment}-eks-node-role`,
      Environment: environment,
    },
  });

  // Attach required policies to node role
  const nodePolicies = [
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
  ];

  nodePolicies.forEach((policy, index) => {
    new aws.iam.RolePolicyAttachment(`${environment}-node-policy-${index}`, {
      role: nodeGroupRole.name,
      policyArn: policy,
    });
  });

  // Security group for nodes
  const nodeSecurityGroup = new aws.ec2.SecurityGroup(`${environment}-eks-node-sg`, {
    vpcId: networking.vpcId,
    description: "Security group for EKS nodes",
    ingress: [
      {
        protocol: "tcp",
        fromPort: 1025,
        toPort: 65535,
        securityGroups: [clusterSecurityGroup.id],
      },
      {
        protocol: "tcp",
        fromPort: 22,
        toPort: 22,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: `${environment}-eks-node-sg`,
      Environment: environment,
    },
  });

  // Create node group (General purpose)
  const generalNodeGroup = new aws.eks.NodeGroup(`${environment}-general-ng`, {
    clusterName: eksCluster.name,
    nodeGroupName: `${environment}-general-ng`,
    nodeRoleArn: nodeGroupRole.arn,
    subnetIds: networking.privateSubnets.apply((subnets: any[]) => subnets.map((s) => s.id)),
    vpcConfig: {
      securityGroupIds: [nodeSecurityGroup.id],
    },
    scalingConfig: {
      desiredSize: desiredCapacity,
      maxSize: maxSize,
      minSize: minSize,
    },
    instanceTypes: [nodeInstanceTypes],
    labels: {
      role: "general",
      managed: "true",
    },
    tags: {
      Name: `${environment}-general-ng`,
      Environment: environment,
    },
  });

  // Create node group (Compute optimized)
  const computeNodeGroup = new aws.eks.NodeGroup(`${environment}-compute-ng`, {
    clusterName: eksCluster.name,
    nodeGroupName: `${environment}-compute-ng`,
    nodeRoleArn: nodeGroupRole.arn,
    subnetIds: networking.privateSubnets.apply((subnets: any[]) => subnets.map((s) => s.id)),
    vpcConfig: {
      securityGroupIds: [nodeSecurityGroup.id],
    },
    scalingConfig: {
      desiredSize: Math.ceil(desiredCapacity / 2),
      maxSize: Math.ceil(maxSize / 2),
      minSize: Math.max(minSize, 1),
    },
    instanceTypes: ["c5.2xlarge"],
    taints: [
      {
        key: "workload",
        value: "compute",
        effect: "NO_EXECUTE",
      },
    ],
    labels: {
      role: "compute",
      managed: "true",
    },
    tags: {
      Name: `${environment}-compute-ng`,
      Environment: environment,
    },
  });

  // Create node group (Storage optimized)
  const storageNodeGroup = new aws.eks.NodeGroup(`${environment}-storage-ng`, {
    clusterName: eksCluster.name,
    nodeGroupName: `${environment}-storage-ng`,
    nodeRoleArn: nodeGroupRole.arn,
    subnetIds: networking.privateSubnets.apply((subnets: any[]) => subnets.map((s) => s.id)),
    vpcConfig: {
      securityGroupIds: [nodeSecurityGroup.id],
    },
    scalingConfig: {
      desiredSize: Math.ceil(desiredCapacity / 2),
      maxSize: Math.ceil(maxSize / 2),
      minSize: Math.max(minSize, 1),
    },
    instanceTypes: ["i3.2xlarge"],
    taints: [
      {
        key: "workload",
        value: "storage",
        effect: "NO_EXECUTE",
      },
    ],
    labels: {
      role: "storage",
      managed: "true",
    },
    tags: {
      Name: `${environment}-storage-ng`,
      Environment: environment,
    },
  });

  // Generate kubeconfig
  const kubeconfig = pulumi
    .all([eksCluster.name, eksCluster.endpoint, eksCluster.certificateAuthority])
    .apply(([clusterName, endpoint, ca]) =>
      JSON.stringify({
        apiVersion: "v1",
        clusters: [
          {
            cluster: {
              server: endpoint,
              "certificate-authority-data": ca?.data,
            },
            name: "kubernetes",
          },
        ],
        contexts: [
          {
            context: {
              cluster: "kubernetes",
              user: "aws",
            },
            name: "aws",
          },
        ],
        currentContext: "aws",
        kind: "Config",
        preferences: {
          colors: true,
        },
        users: [
          {
            name: "aws",
            user: {
              exec: {
                apiVersion: "client.authentication.k8s.io/v1beta1",
                command: "aws-iam-authenticator",
                args: ["token", "-i", clusterName],
              },
            },
          },
        ],
      })
    );

  return {
    clusterId: eksCluster.id,
    clusterName: eksCluster.name,
    clusterEndpoint: eksCluster.endpoint,
    clusterVersion: eksCluster.version,
    nodeGroupId: generalNodeGroup.id,
    kubeconfig: kubeconfig,
  };
}