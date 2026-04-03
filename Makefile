# Makefile
.PHONY: help install build preview deploy destroy refresh logs lint format

help:
	@echo "Available commands:"
	@echo "  make install    - Install dependencies"
	@echo "  make build      - Build TypeScript"
	@echo "  make preview    - Preview infrastructure changes"
	@echo "  make deploy     - Deploy infrastructure"
	@echo "  make destroy    - Destroy infrastructure"
	@echo "  make refresh    - Refresh stack state"
	@echo "  make lint       - Lint code"
	@echo "  make format     - Format code"
	@echo "  make logs       - View cluster logs"

install:
	npm install

build:
	npm run build

preview:
	pulumi preview

deply:
	pulumi up

destroy:
	pulumi destroy

refresh:
	pulumi refresh

logs:
	aws logs tail /aws/eks/prod-eks-cluster/cluster --follow

lint:
	npm run lint

format:
	npm run format
