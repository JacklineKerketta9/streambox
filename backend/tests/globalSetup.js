const { execSync } = require('child_process');

// Creates the test database (if needed) and syncs the schema before any test runs.
module.exports = async () => {
  const url = process.env.TEST_DATABASE_URL || 'mysql://root:root@localhost:3307/streambox_test';
  if (!/test/i.test(url.split('/').pop())) {
    throw new Error('Refusing to reset a database whose name does not contain "test"');
  }
  execSync('npx prisma db push --skip-generate --force-reset --accept-data-loss', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
};
