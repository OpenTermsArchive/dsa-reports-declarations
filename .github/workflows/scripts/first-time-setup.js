import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function removeFirstTimeSetupFiles() {
  await fs.unlink('.github/workflows/first-time-setup.yml').catch(error => {
    console.warn('Could not remove first-time-setup.yml:', error.message);
  });

  await fs.unlink('.github/workflows/scripts/first-time-setup.js').catch(error => {
    console.warn('Could not remove first-time-setup.js:', error.message);
  });
}

async function removeDeclarations() {
  const declarationsPath = join(process.cwd(), 'declarations');

  try {
    const files = await fs.readdir(declarationsPath);

    await Promise.all(files.map(file =>
      fs.unlink(join(declarationsPath, file)).catch(error => {
        console.warn(`Could not remove declaration file ${file}:`, error.message);
      })
    ));
  } catch (error) {
    console.warn('Could not process declarations directory:', error.message);
  }
}

async function updateDependabot(repoOwner, repoName) {
  const dependabotPath = '.github/dependabot.yml';
  let content = await fs.readFile(dependabotPath, 'utf8');

  content = content.replace('OpenTermsArchive/demo', `${repoOwner}/${repoName}`);
  await fs.writeFile(dependabotPath, content);
}

async function setupDeploymentFiles() {
  const inventoryContent = `all:
  hosts:
    <your_server_hostname>:
      ansible_user: <your_server_username>
      ed25519_fingerprint: <your_server_ssh_fingerprint>
      ota_source_repository: <your_repository_url>`;

  const securityComment = '# This file contains sensitive data and should be encrypted with ansible-vault encrypt command and this comment should be removed';

  const envContent = `${securityComment}
OTA_ENGINE_SMTP_PASSWORD=<your_smtp_password>
OTA_ENGINE_GITHUB_TOKEN=<your_github_token>`;

  const privateKeyContent = `${securityComment}
<your_private_key>`;

  await fs.writeFile('deployment/inventory.yml', inventoryContent);
  await fs.writeFile('deployment/.env', envContent);
  await fs.writeFile('deployment/github-bot-private-key', privateKeyContent);
}

async function updateConfig(repoOwner, collectionName) {
  const configPath = 'config/production.json';
  let content = await fs.readFile(configPath, 'utf8');

  content = content.replace(/demo/g, collectionName);
  content = content.replace(/OpenTermsArchive/g, repoOwner);
  await fs.writeFile(configPath, content);
}

async function updateReadme(repoOwner, collectionName) {
  const readmePath = 'README.md';
  let content = await fs.readFile(readmePath, 'utf8');

  content = content.replace(/<!-- here goes your collection name -->.*<!-- until here -->/g, collectionName);
  content = content.replaceAll('OpenTermsArchive/demo-versions', `${repoOwner}/${collectionName}-versions`);
  await fs.writeFile(readmePath, content);
}

async function removeFederationRelatedCode() {
  const pm2ConfigPath = 'deployment/pm2.config.cjs';
  let pm2Content = await fs.readFile(pm2ConfigPath, 'utf8');

  pm2Content = pm2Content.replace(/,?\s*{\s*name:\s*'ota-federation-api'[^}]*},?/, '');
  pm2Content = pm2Content.replace(/,\s*,/g, ',');
  pm2Content = pm2Content.replace(/,(\s*\]\s*})/g, '$1');

  await fs.writeFile(pm2ConfigPath, pm2Content);

  const packagePath = 'package.json';
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));

  delete packageJson.dependencies['@opentermsarchive/federation-api'];
  delete packageJson.scripts['start:federation-api'];

  await fs.writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const productionPath = 'config/production.json';
  const productionJson = JSON.parse(await fs.readFile(productionPath, 'utf8'));

  delete productionJson['@opentermsarchive/federation-api'];

  await fs.writeFile(productionPath, `${JSON.stringify(productionJson, null, 2)}\n`);

  try {
    await fs.unlink('package-lock.json');
    await execAsync('npm install');
  } catch (error) {
    console.warn('Error while regenerating package-lock.json:', error.message);
  }
}

async function updateMetadata(repoOwner, collectionName) {
  const metadataPath = 'metadata.yml';
  const today = new Date().toISOString().split('T')[0];

  const yamlContent = `id: ${collectionName}
name: ${collectionName}
tagline: ''
description: ''
dataset: https://github.com/${repoOwner}/${collectionName}-versions/releases
declarations: https://github.com/${repoOwner}/${collectionName}-declarations
versions: https://github.com/${repoOwner}/${collectionName}-versions
snapshots: https://github.com/${repoOwner}/${collectionName}-snapshots
donations: ''
logo: ''
languages: []
jurisdictions: []
trackingPeriods:
  - startDate: ${today}
    schedule: "30 */12 * * *"
    serverLocation: ''
governance:
  ${repoOwner}:
    url: ''
    logo: ''
    roles: [administrator, curator, maintainer]
`;

  await fs.writeFile(metadataPath, yamlContent);
}

async function clearContributors() {
  const contributorsConfigPath = '.all-contributorsrc';
  const config = JSON.parse(await fs.readFile(contributorsConfigPath, 'utf8'));
  
  config.contributors = [];
  config.projectName = repoName;
  config.projectOwner = repoOwner;
  
  await fs.writeFile(contributorsConfigPath, `${JSON.stringify(config, null, 2)}\n`);

  const contributorsMdPath = '.all-contributors.md';
  let content = await fs.readFile(contributorsMdPath, 'utf8');
  content = content.replace(/<table>[\s\S]*?<\/table>/, '');
  await fs.writeFile(contributorsMdPath, content);
}

async function updateContributingGuide(issueNumber) {
  const contributingPath = 'CONTRIBUTING.md';
  let content = await fs.readFile(contributingPath, 'utf8');
  
  content = content.replace(/OpenTermsArchive\/demo-declarations\/issues\/73/g, `${repoOwner}/${repoName}/issues/${issueNumber}`);
  
  await fs.writeFile(contributingPath, content);
}

async function firstTimeSetup(repoOwner, repoName, issueNumber) {
  try {
    const collectionName = repoName.replace('-declarations', '');

    console.log('Start first time setup');

    console.log('Removing declarations…');
    await removeDeclarations();

    console.log('Removing federation-related code…');
    await removeFederationRelatedCode();

    console.log('Clearing contributors…');
    await clearContributors();

    console.log('Updating contributing guide with new issue number…');
    await updateContributingGuide(issueNumber);

    console.log('Updating Dependabot configuration…');
    await updateDependabot(repoOwner, repoName);

    console.log('Updating configuration files…');
    await updateConfig(repoOwner, collectionName);

    console.log('Updating README…');
    await updateReadme(repoOwner, collectionName);

    console.log('Updating metadata…');
    await updateMetadata(repoOwner, collectionName);

    console.log('Setting up deployment files…');
    await setupDeploymentFiles();

    console.log('Removing first time setup files…');
    await removeFirstTimeSetupFiles();

    console.log('First time setup completed successfully!');
  } catch (error) {
    console.error('Error during first time setup:', error);
    process.exit(1);
  }
}

const args = process.argv.slice(2);

if (args.length !== 3) {
  console.error('Usage: node first-time-setup.js <repository-owner> <repository-name> <issue-number>');
  console.error('Example: node first-time-setup.js OpenTermsArchive demo-declarations 1');
  process.exit(1);
}

const [ repoOwner, repoName, issueNumber ] = args;

firstTimeSetup(repoOwner, repoName, issueNumber);
