const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const env = require('../../config/env');
const authService = require('./auth.service');

const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL);

if (googleEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const primary = profile.emails && profile.emails[0];
          const user = await authService.findOrCreateOAuthUser({
            provider: 'google',
            providerUserId: profile.id,
            email: primary && primary.value,
            emailVerified: Boolean((primary && primary.verified) || (profile._json && profile._json.email_verified)),
            name: profile.displayName,
          });
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    )
  );
}

module.exports = { passport, googleEnabled };
