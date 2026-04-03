# Production-Grade AWS Infrastructure with Pulumi (TypeScript)

This repository contains a complete, production-ready AWS infrastructure setup using Pulumi and TypeScript. It includes networking components, EKS cluster, node groups, and essential Kubernetes addons.

## Architecture Overview

### Networking Components
- **VPC**: Custom VPC with configurable CIDR block
- **Subnets**: Public and private subnets across multiple availability zones
- **Internet Gateway**: For public subnet internet access
- **NAT Gateway**: For private subnet outbound connectivity
- **Route Tables**: Separate routing for public and private subnets
- **Network ACLs**: Security controls for ingress/egress traffic
- **Security Groups**: Layer 4 security for EKS resources

### EKS Components
- **EKS Cluster**: Managed Kubernetes cluster with logging enabled
- **Node Groups**:
  - **General Purpose**: For typical workloads (t3.xlarge)
  - **Compute Optimized**: For compute-intensive workloads (c5.2xlarge)
  - **Storage Optimized**: For storage-intensive workloads (i3.2xlarge)
- **IAM Roles**: Proper permissions for cluster and nodes
- **Security Groups**: Network segmentation and access control

### Kubernetes Addons
- **VPC CNI**: Pod networking and IP address management
- **CoreDNS**: Service discovery and DNS resolution
- **kube-proxy**: Network proxy and service routing
- **AWS EBS CSI Driver**: Persistent volume support with EBS

## Directory Structure

```
.
├── README.md
├── Pulumi.yaml                    # Pulumi configuration
├── package.json                   # Node.js dependencies
├── tsconfig.json                  # TypeScript configuration
└── src/
    ├── index.ts                   # Main entry point
    └── modules/
        ├── networking/
        │   └── index.ts          # VPC, subnets, routing, NACLs
        ├── eks/
        │   └── index.ts          # EKS cluster and node groups
        └── addons/
            └── index.ts          # Kubernetes addons
```

## Prerequisites

1. **Node.js**: Version 16 or higher
2. **AWS Account**: With appropriate permissions
3. **AWS CLI**: Configured with credentials
4. **Pulumi CLI**: Version 3.0 or higher
5. **kubectl**: For cluster management (optional)

Install Pulumi:
```bash
curl -fsSL https://get.pulumi.com | sh
```

## Configuration

Edit `Pulumi.yaml` to customize:

```yaml
config:
  aws:region: us-east-1              # AWS region
  environment: prod                   # Environment name
  vpc_cidr: 10.0.0.0/16              # VPC CIDR block
  eks_version: "1.29"                # EKS cluster version
  node_instance_types: t3.xlarge      # Node instance type
  desired_capacity: 3                 # Desired number of nodes
  min_size: 1                         # Minimum nodes
  max_size: 10                        # Maximum nodes
```

## Installation & Deployment

### 1. Install Dependencies
```bash
npm install
```

### 2. Build TypeScript
```bash
npm run build
```

### 3. Initialize Pulumi Stack
```bash
pulumi stack init prod
```

### 4. Preview Changes
```bash
pulumi preview
```

### 5. Deploy Infrastructure
```bash
pulumi up
```

### 6. Get Kubeconfig
```bash
pulumi stack output kubeconfig > ~/.kube/config-eks
export KUBECONFIG=~/.kube/config-eks
```

### 7. Verify Cluster
```bash
kubectl get nodes
kubectl get pods --all-namespaces
```

## Management Commands

### Preview changes without applying
```bash
pulumi preview
```

### Deploy infrastructure
```bash
pulumi up
```

### Refresh state (check for drifts)
```bash
pulumi refresh
```

### Destroy all resources
```bash
pulumi destroy
```

### View stack outputs
```bash
pulumi stack output
```

### Export stack as JSON
```bash
pulumi stack export > stack.json
```

## Outputs

After deployment, you can access:

```bash
# VPC ID
pulumi stack output vpcId

# Public Subnets
pulumi stack output publicSubnets

# Private Subnets
pulumi stack output privateSubnets

# EKS Cluster ID
pulumi stack output eksClusterId

# EKS Cluster Endpoint
pulumi stack output eksClusterEndpoint

# Kubeconfig (JSON)
pulumi stack output kubeconfig
```

## Security Best Practices

✓ **Network Isolation**: Public and private subnets with proper routing
✓ **Security Groups**: Restrictive ingress/egress rules
✓ **NACLs**: Fine-grained network access control
✓ **IAM Roles**: Least privilege principle with specific policies
✓ **Cluster Logging**: Enabled for audit, API, authenticator, controller manager, and scheduler
✓ **Private Endpoints**: Private API access enabled for EKS cluster
✓ **Node Security**: SSM access for secure node management
✓ **Taints and Tolerations**: Workload isolation for specialized node groups

## Scaling Node Groups

To adjust node group capacity, modify `Pulumi.yaml`:

```yaml
desired_capacity: 5     # Increase desired nodes
max_size: 20           # Increase max capacity
```

Then deploy:
```bash
pulumi up
```

## Monitoring & Logging

The EKS cluster has the following log types enabled:
- **api**: API server logs
- **audit**: Audit logs for compliance
- **authenticator**: Authentication logs
- **controllerManager**: Controller manager logs
- **scheduler**: Scheduler logs

View logs in CloudWatch:
```bash
aws logs describe-log-groups --query 'logGroups[?contains(logGroupName, `eks`)]'
```

## Troubleshooting

### Nodes not joining cluster
1. Check security group rules
2. Verify IAM role permissions
3. Check node logs: `aws ec2 describe-instances`

### Pods stuck in pending
1. Check node resources: `kubectl describe nodes`
2. Check pod events: `kubectl describe pod <pod-name>`
3. Verify addon status: `kubectl get all -n kube-system`

### Cannot connect to cluster
1. Verify kubeconfig: `kubectl cluster-info`
2. Check cluster endpoint: `pulumi stack output eksClusterEndpoint`
3. Verify AWS credentials and permissions

## Cleanup

To destroy all resources:

```bash
pulumi destroy
```

This will:
- Delete EKS cluster and node groups
- Delete all subnets and VPC
- Delete NAT gateway and elastic IP
- Delete all security groups and NACLs
- Remove all IAM roles and policies

⚠️ **Warning**: This is irreversible. Make sure you have backups before destroying.

## Cost Estimation

Approximate monthly costs (us-east-1, on-demand):
- **EKS Cluster**: $73
- **3x t3.xlarge nodes**: ~$300
- **1x c5.2xlarge node**: ~$100
- **1x i3.2xlarge node**: ~$250
- **NAT Gateway**: ~$32
- **Data Transfer**: Variable

Total: ~$750+/month (before data transfer)

## Advanced Configurations

### Adding a new node group
Edit `src/modules/eks/index.ts` and add:

```typescript
const customNodeGroup = new aws.eks.NodeGroup(`${environment}-custom-ng`, {
  clusterName: eksCluster.name,
  // ... configuration
});
```

### Custom VPC CIDR
Update `Pulumi.yaml`:
```yaml
vpc_cidr: 10.50.0.0/16
```

And update subnet CIDR calculations in `src/modules/networking/index.ts`.

### Adding additional addons
Edit `src/modules/addons/index.ts` and add new addon resources.

## Contributing

1. Create a feature branch
2. Make changes
3. Test with `pulumi preview`
4. Submit pull request

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:
1. Check Pulumi documentation: https://www.pulumi.com/docs/
2. AWS documentation: https://docs.aws.amazon.com/
3. Kubernetes documentation: https://kubernetes.io/docs/

## References

- [Pulumi AWS Provider](https://www.pulumi.com/registry/packages/aws/)
- [AWS EKS Best Practices](https://docs.aws.amazon.com/eks/latest/userguide/)
- [Kubernetes Best Practices](https://kubernetes.io/docs/concepts/cluster-administration/manage-deployment/)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
