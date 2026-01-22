import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function rollback() {
  console.log(chalk.bold.yellow('\n⚠️  ROLLBACK INITIATED\n'));
  
  const backupsDir = path.join(__dirname, '../../backups');
  
  if (!fs.existsSync(backupsDir)) {
    console.log(chalk.red('No backups found. Unable to rollback.\n'));
    return;
  }
  
  const backups = fs.readdirSync(backupsDir);
  
  if (backups.length === 0) {
    console.log(chalk.red('No backups available.\n'));
    return;
  }
  
  console.log(chalk.cyan('Available backups:\n'));
  backups.forEach((backup, i) => {
    console.log(\`  [\${i + 1}] \${backup}\`);
  });
  
  console.log(chalk.yellow('\nTo rollback to a specific backup:'));
  console.log('npm run rollback -- <backup-name>\n');
  
  // If backup specified in args
  const backupName = process.argv[2];
  
  if (backupName && backups.includes(backupName)) {
    console.log(chalk.cyan(\`Rolling back to: \${backupName}...\n\`));
    
    const backupPath = path.join(backupsDir, backupName);
    const moldaMainPath = path.join(__dirname, '../../Molda-main');
    
    try {
      // Copy backup files back
      fs.copySync(backupPath, moldaMainPath, { overwrite: true });
      console.log(chalk.green('✅ Rollback complete!\n'));
    } catch (error) {
      console.log(chalk.red('❌ Rollback failed:', error.message, '\n'));
    }
  } else if (backupName) {
    console.log(chalk.red(\`Backup '\${backupName}' not found.\n\`));
  }
}

rollback();
