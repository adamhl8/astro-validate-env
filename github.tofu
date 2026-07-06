terraform {
  backend "s3" {
    profile = "adamhl8"
    bucket  = "tofu-state-269329412317-us-east-1-an"
    key     = "adamhl8/astro-validate-env.tfstate"
    region  = "us-east-1"
  }
}

module "github" {
  source    = "./node_modules/@adamhl8/configs/dist/tofu/github"
  repo_name = "astro-validate-env"
  actions_secrets = {
    NPM_CI_TOKEN = true
  }
  repo_settings = {
    visibility = "public"
  }
}
