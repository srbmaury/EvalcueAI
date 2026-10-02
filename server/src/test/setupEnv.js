// Tests must be reproducible without a developer's untracked .env file.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "evalcue-ci-test-jwt-secret-not-for-production";
process.env.ENABLE_CODE_EXEC = "true";
process.env.ENABLE_STT = "true";
