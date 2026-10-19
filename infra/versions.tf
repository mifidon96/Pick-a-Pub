terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State lives in S3, one file per environment. The bucket comes from
  # infra/bootstrap; scripts/deploy.sh fills in the details:
  #   bucket = pickapub-tfstate-<account id>, key = <env>/terraform.tfstate
  backend "s3" {
    region       = "eu-west-2"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  # Every resource name starts with this, e.g. pickapub-prod-api.
  name = "${var.project}-${var.environment}"
}
