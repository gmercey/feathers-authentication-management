const errors = require('@feathersjs/errors');
const makeDebug = require('debug');
const ensureObjPropsValid = require('./helpers/ensure-obj-props-valid');
const ensureValuesAreStrings = require('./helpers/ensure-values-are-strings');
const getUserData = require('./helpers/get-user-data');
const hashPassword = require('./helpers/hash-password');
const notifier = require('./helpers/notifier');

const debug = makeDebug('authLocalMgnt:verifySignupSetPassword');

module.exports = {
  verifySignupSetPasswordWithLongToken,
  verifySignupSetPasswordWithShortToken
};

async function verifySignupSetPasswordWithLongToken (
  options,
  verifyToken,
  password,
  field,
  notifierOptions = {},
  params = {}
) {
  ensureValuesAreStrings(verifyToken, password);

  const result = await verifySignupSetPassword(
    options,
    { verifyToken },
    { verifyToken },
    password,
    field,
    notifierOptions,
    params
  );
  return result;
}

async function verifySignupSetPasswordWithShortToken (
  options,
  verifyShortToken,
  identifyUser,
  password,
  field,
  notifierOptions = {},
  params = {}
) {
  ensureValuesAreStrings(verifyShortToken, password);
  ensureObjPropsValid(identifyUser, options.identifyUserProps);

  const result = await verifySignupSetPassword(
    options,
    identifyUser,
    {
      verifyShortToken
    },
    password,
    field,
    notifierOptions,
    params
  );
  return result;
}

async function verifySignupSetPassword (options, query, tokens, password, field, notifierOptions = {}, params = {}) {
  debug('verifySignupSetPassword', query, tokens, password);
  const usersService = options.app.service(options.service);
  const usersServiceIdName = usersService.id;

  const users = await usersService.find({ ...params, query });
  const user1 = getUserData(users, [
    'isNotVerifiedOrHasVerifyChanges',
    'verifyNotExpired'
  ]);

  if (!Object.keys(tokens).every((key) => tokens[key] === user1[key])) {
    await eraseVerifyProps(user1, user1.isVerified, {}, params);

    throw new errors.BadRequest(
      'Invalid token. Get for a new one. (authLocalMgnt)',
      { errors: { $className: 'badParam' } }
    );
  }

  const user2 = await eraseVerifyPropsSetPassword(
    user1,
    user1.verifyExpires > Date.now(),
    user1.verifyChanges || {},
    password,
    field,
    params
  );

  const user3 = await notifier(options.notifier, 'verifySignupSetPassword', user2, notifierOptions);
  return options.sanitizeUserForClient(user3);

  async function eraseVerifyProps (user, isVerified, verifyChanges, params = {}) {
    const patchToUser = Object.assign({}, verifyChanges || {}, {
      isVerified,
      verifyToken: null,
      verifyShortToken: null,
      verifyExpires: null,
      verifyChanges: {}
    });

    const result = await usersService.patch(user[usersServiceIdName], patchToUser, params);
    return result;
  }

  async function eraseVerifyPropsSetPassword (user, isVerified, verifyChanges, password, field, params = {}) {
    const hashedPassword = await hashPassword(options.app, password, field);

    const patchToUser = Object.assign({}, verifyChanges || {}, {
      isVerified,
      verifyToken: null,
      verifyShortToken: null,
      verifyExpires: null,
      verifyChanges: {},
      password: hashedPassword
    });

    const result = await usersService.patch(user[usersServiceIdName], patchToUser, params);
    return result;
  }
}
