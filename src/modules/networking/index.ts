import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

interface NetworkingOutput {
  vpcId: pulumi.Output<string>;
  publicSubnets: pulumi.Output<string>[];
  privateSubnets: pulumi.Output<string>[];
  igwId: pulumi.Output<string>;
  natGatewayId: pulumi.Output<string>;
  publicRouteTableId: pulumi.Output<string>;
  privateRouteTableId: pulumi.Output<string>;
}

export function createNetworking(environment: string): NetworkingOutput {
  const config = new pulumi.Config();
  const vpcCidr = config.require("vpc_cidr");
  const awsRegion = config.require("aws:region");

  // Get available AZs
  const azs = aws.getAvailabilityZones({ state: "available" });

  // Create VPC
  const vpc = new aws.ec2.Vpc(`${environment}-vpc`, {
    cidrBlock: vpcCidr,
    enableDnsHostnames: true,
    enableDnsSupport: true,
    tags: {
      Name: `${environment}-vpc`,
      Environment: environment,
    },
  });

  // Create Internet Gateway
  const igw = new aws.ec2.InternetGateway(`${environment}-igw`, {
    vpcId: vpc.id,
    tags: {
      Name: `${environment}-igw`,
      Environment: environment,
    },
  });

  // Public Subnets
  const publicSubnets = azs.then((azData) =>
    azData.names.map((az, index) => {
      const subnet = new aws.ec2.Subnet(`${environment}-public-subnet-${index}`, {
        vpcId: vpc.id,
        cidrBlock: `10.0.${index}.0/24`,
        availabilityZone: az,
        mapPublicIpOnLaunch: true,
        tags: {
          Name: `${environment}-public-subnet-${index}`,
          Environment: environment,
          Type: "public",
        },
      });
      return subnet;
    })
  );

  // Elastic IP for NAT Gateway
  const eip = new aws.ec2.Eip(`${environment}-nat-eip`, {
    vpc: true,
    tags: {
      Name: `${environment}-nat-eip`,
      Environment: environment,
    },
  });

  // NAT Gateway (in first public subnet)
  const natGateway = pulumi.all([publicSubnets, eip.id]).then(([subnets, eipId]) => {
    return new aws.ec2.NatGateway(`${environment}-nat`, {
      subnetId: subnets[0].id,
      allocationId: eipId,
      tags: {
        Name: `${environment}-nat`,
        Environment: environment,
      },
    });
  });

  // Private Subnets
  const privateSubnets = azs.then((azData) =>
    azData.names.map((az, index) => {
      const subnet = new aws.ec2.Subnet(`${environment}-private-subnet-${index}`, {
        vpcId: vpc.id,
        cidrBlock: `10.0.${100 + index}.0/24`,
        availabilityZone: az,
        tags: {
          Name: `${environment}-private-subnet-${index}`,
          Environment: environment,
          Type: "private",
        },
      });
      return subnet;
    })
  );

  // Public Route Table
  const publicRouteTable = new aws.ec2.RouteTable(`${environment}-public-rt`, {
    vpcId: vpc.id,
    tags: {
      Name: `${environment}-public-rt`,
      Environment: environment,
    },
  });

  // Public Route (IGW)
  new aws.ec2.Route(`${environment}-public-route`, {
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: igw.id,
  });

  // Private Route Table
  const privateRouteTable = new aws.ec2.RouteTable(`${environment}-private-rt`, {
    vpcId: vpc.id,
    tags: {
      Name: `${environment}-private-rt`,
      Environment: environment,
    },
  });

  // Private Route (NAT Gateway)
  new aws.ec2.Route(
    `${environment}-private-route`,
    {
      routeTableId: privateRouteTable.id,
      destinationCidrBlock: "0.0.0.0/0",
      natGatewayId: natGateway.then((ng) => ng.id),
    },
    { dependsOn: natGateway }
  );

  // Associate Public Subnets with Public Route Table
  publicSubnets.then((subnets) => {
    subnets.forEach((subnet, index) => {
      new aws.ec2.RouteTableAssociation(`${environment}-public-rta-${index}`, {
        subnetId: subnet.id,
        routeTableId: publicRouteTable.id,
      });
    });
  });

  // Associate Private Subnets with Private Route Table
  privateSubnets.then((subnets) => {
    subnets.forEach((subnet, index) => {
      new aws.ec2.RouteTableAssociation(`${environment}-private-rta-${index}`, {
        subnetId: subnet.id,
        routeTableId: privateRouteTable.id,
      });
    });
  });

  // Network ACL for Public Subnets
  const publicNacl = new aws.ec2.NetworkAcl(`${environment}-public-nacl`, {
    vpcId: vpc.id,
    tags: {
      Name: `${environment}-public-nacl`,
      Environment: environment,
    },
  });

  // Inbound rules for public NACL
  new aws.ec2.NetworkAclRule(`${environment}-public-nacl-in-http`, {
    networkAclId: publicNacl.id,
    protocol: "tcp",
    ruleNumber: 100,
    egress: false,
    ruleAction: "allow",
    cidrBlock: "0.0.0.0/0",
    fromPort: 80,
    toPort: 80,
  });

  new aws.ec2.NetworkAclRule(`${environment}-public-nacl-in-https`, {
    networkAclId: publicNacl.id,
    protocol: "tcp",
    ruleNumber: 110,
    egress: false,
    ruleAction: "allow",
    cidrBlock: "0.0.0.0/0",
    fromPort: 443,
    toPort: 443,
  });

  new aws.ec2.NetworkAclRule(`${environment}-public-nacl-in-ssh`, {
    networkAclId: publicNacl.id,
    protocol: "tcp",
    ruleNumber: 120,
    egress: false,
    ruleAction: "allow",
    cidrBlock: "0.0.0.0/0",
    fromPort: 22,
    toPort: 22,
  });

  // Outbound rules for public NACL
  new aws.ec2.NetworkAclRule(`${environment}-public-nacl-out-all`, {
    networkAclId: publicNacl.id,
    protocol: "-1",
    ruleNumber: 100,
    egress: true,
    ruleAction: "allow",
    cidrBlock: "0.0.0.0/0",
  });

  // Network ACL for Private Subnets
  const privateNacl = new aws.ec2.NetworkAcl(`${environment}-private-nacl`, {
    vpcId: vpc.id,
    tags: {
      Name: `${environment}-private-nacl`,
      Environment: environment,
    },
  });

  // Inbound rules for private NACL
  new aws.ec2.NetworkAclRule(`${environment}-private-nacl-in-vpc`, {
    networkAclId: privateNacl.id,
    protocol: "-1",
    ruleNumber: 100,
    egress: false,
    ruleAction: "allow",
    cidrBlock: vpcCidr,
  });

  // Outbound rules for private NACL
  new aws.ec2.NetworkAclRule(`${environment}-private-nacl-out-all`, {
    networkAclId: privateNacl.id,
    protocol: "-1",
    ruleNumber: 100,
    egress: true,
    ruleAction: "allow",
    cidrBlock: "0.0.0.0/0",
  });

  // Associate NACLs with subnets
  publicSubnets.then((subnets) => {
    subnets.forEach((subnet, index) => {
      new aws.ec2.NetworkAclAssociation(`${environment}-public-nacl-assoc-${index}`, {
        subnetId: subnet.id,
        networkAclId: publicNacl.id,
      });
    });
  });

  privateSubnets.then((subnets) => {
    subnets.forEach((subnet, index) => {
      new aws.ec2.NetworkAclAssociation(`${environment}-private-nacl-assoc-${index}`, {
        subnetId: subnet.id,
        networkAclId: privateNacl.id,
      });
    });
  });

  return {
    vpcId: vpc.id,
    publicSubnets,
    privateSubnets,
    igwId: igw.id,
    natGatewayId: natGateway.then((ng) => ng.id),
    publicRouteTableId: publicRouteTable.id,
    privateRouteTableId: privateRouteTable.id,
  };
}