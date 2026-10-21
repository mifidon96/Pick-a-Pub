# TFLint checks the Terraform in infra/ for mistakes `terraform validate` misses:
# unused variables, missing types, deprecated syntax, and (with the AWS plugin)
# values AWS would reject at apply time, such as an invalid instance class.
config {
  call_module_type = "none"
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "aws" {
  enabled = true
  version = "0.49.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}
