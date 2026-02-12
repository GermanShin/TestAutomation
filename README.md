# Allure Reports Viewer - Deployment Guide

## Prerequisites

1. AWS CLI configured with your credentials
2. Node.js 18+ installed
3. AWS CDK CLI installed: `npm install -g aws-cdk`
4. Your domain hosted in Route53
5. S3 bucket with Allure reports uploaded

## Project Structure

```
your-project/
├── bin/
│   └── app.ts                 # CDK app entry point
├── lib/
│   ├── global-stack.ts        # Global resources (certificates)
│   └── regional-stack.ts      # Regional resources (Lambda, ALB, S3)
├── lambda/
│   └── dashboard.ts           # Lambda function code
├── package.json
├── tsconfig.json
└── cdk.json
```

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Environment Variables

```bash
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=us-west-2  # Or your preferred region
```

## Step 3: Bootstrap CDK (First Time Only)

```bash
# Bootstrap us-east-1 for CloudFront certificates
cdk bootstrap aws://${CDK_DEFAULT_ACCOUNT}/us-east-1

# Bootstrap your regional stack region
cdk bootstrap aws://${CDK_DEFAULT_ACCOUNT}/${CDK_DEFAULT_REGION}
```

## Step 4: Upload Sample Report to S3

The stack will create a bucket named: `allure-reports-{your-account-id}`

Or if you want to use an existing bucket, you can specify it in the context:

```bash
# Option A: Let CDK create the bucket (recommended)
# The bucket will be named: allure-reports-{account-id}

# Option B: Use existing bucket
cdk deploy --all --context allureBucketName=your-existing-bucket-name
```

Upload your test report:

```bash
# Get the bucket name from the stack outputs after deployment
BUCKET_NAME=allure-reports-$(aws sts get-caller-identity --query Account --output text)

# Upload sample report
aws s3 cp index.html s3://${BUCKET_NAME}/test-report-2024-02-08/index.html

# Or upload entire folder
aws s3 sync ./my-report-folder/ s3://${BUCKET_NAME}/test-report-2024-02-08/
```

## Step 5: Deploy the Stacks

```bash
# Deploy all stacks
cdk deploy --all

# Or deploy individually
cdk deploy AllureViewer-Global
cdk deploy AllureViewer-Regional
```

## Step 6: Create a Cognito User

After deployment, create a user to test:

```bash
# Get the User Pool ID from stack outputs
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name AllureViewer-Regional \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text)

# Create a test user
aws cognito-idp admin-create-user \
  --user-pool-id ${USER_POOL_ID} \
  --username testuser@example.com \
  --user-attributes Name=email,Value=testuser@example.com \
  --temporary-password TempPassword123! \
  --message-action SUPPRESS

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id ${USER_POOL_ID} \
  --username testuser@example.com \
  --password YourPassword123! \
  --permanent
```

## Step 7: Access Your Dashboard

Visit: `https://allurereport.ds-shin.com`

You'll be redirected to Cognito login at: `https://allurereportlogin.ds-shin.com`

Log in with your created user credentials.

## Troubleshooting

### Issue: "No reports available"

**Solution**: Check your S3 bucket structure:

```bash
aws s3 ls s3://allure-reports-{account-id}/ --recursive
```

Expected structure:

```
test-report-2024-02-08/index.html
test-report-2024-02-08/styles.css
test-report-2024-02-08/app.js
```

### Issue: Lambda timeout or error

**Solution**: Check CloudWatch Logs:

```bash
aws logs tail /aws/lambda/AllureViewer-Regional-DashboardFn --follow
```

### Issue: 403 Forbidden when accessing report files

**Solution**: Verify Lambda has S3 read permissions:

```bash
# Check IAM role
aws iam list-attached-role-policies \
  --role-name AllureViewer-Regional-DashboardFnServiceRole-XXX
```

### Issue: Certificate validation pending

**Solution**: Wait for DNS propagation (can take 5-30 minutes). Check ACM console:

```bash
aws acm list-certificates --region us-east-1
```

## Useful Commands

```bash
# View stack outputs
cdk deploy --all --outputs-file outputs.json
cat outputs.json

# Destroy all resources (WARNING: This deletes everything except S3 bucket contents)
cdk destroy --all

# View CloudFormation template
cdk synth

# Diff changes before deploying
cdk diff
```

## File Upload Examples

### Upload single file

```bash
aws s3 cp index.html s3://allure-reports-{account}/my-report/index.html
```

### Upload entire directory

```bash
aws s3 sync ./allure-report/ s3://allure-reports-{account}/playwright-2024-02-08/
```

### Copy from existing location

```bash
aws s3 cp s3://my-ci-bucket/latest-report/ s3://allure-reports-{account}/latest/ --recursive
```

## Integration with CI/CD

### Example: GitHub Actions

```yaml
- name: Upload Allure Report to S3
  run: |
    REPORT_NAME="report-$(date +%Y-%m-%d-%H%M%S)"
    aws s3 sync ./allure-report/ s3://${{ secrets.ALLURE_BUCKET }}/${REPORT_NAME}/
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    AWS_REGION: us-west-2
```

### Example: CodeBuild

Add to your buildspec.yml:

```yaml
post_build:
  commands:
    - REPORT_NAME="build-${CODEBUILD_BUILD_NUMBER}"
    - aws s3 sync ./allure-report/ s3://${ALLURE_BUCKET}/${REPORT_NAME}/
```

## Cost Estimation

- **ALB**: ~$16-20/month
- **Lambda**: ~$0.20/month (1000 requests)
- **S3**: ~$0.023/GB/month
- **Cognito**: Free tier (50,000 MAU)
- **Route53**: $0.50/hosted zone/month
- **ACM Certificates**: Free

**Total**: Approximately $17-25/month for basic usage

## Security Best Practices

1. Enable MFA for Cognito users
2. Use least-privilege IAM policies
3. Enable CloudTrail logging
4. Set up CloudWatch alarms for unusual activity
5. Rotate passwords regularly
6. Enable S3 bucket versioning for report history
