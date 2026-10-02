const express = require('express');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { signupSchema, loginSchema } = require('./auth.schemas');
const { googleEnabled } = require('./passport');
const ctrl = require('./auth.controller');

const router = express.Router();

router.post('/signup', validate(signupSchema), ctrl.signup);
router.post('/login', validate(loginSchema), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.get('/me', authenticate, ctrl.me);

if (googleEnabled) {
  router.get('/google', ctrl.googleStart);
  router.get('/google/callback', ctrl.googleCallback);
}

module.exports = router;
