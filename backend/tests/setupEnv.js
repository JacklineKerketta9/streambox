process.env.NODE_ENV = 'test';
// Always a dedicated test database, never the dev one (tests wipe tables).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'mysql://root:root@localhost:3307/streambox_test';
// Keep test cache/progress keys away from the development Redis database.
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123';
