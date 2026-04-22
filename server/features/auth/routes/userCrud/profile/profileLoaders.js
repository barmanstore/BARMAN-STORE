const loadUserById = async ({ dbGetAsync, userId }) =>
  dbGetAsync('SELECT * FROM users WHERE id = ?', [userId]);

const loadUserForProfileImage = async ({ dbGetAsync, userId }) =>
  dbGetAsync('SELECT id, profile_image FROM users WHERE id = ?', [userId]);

const loadUserForRead = async ({ dbGetAsync, userId }) =>
  dbGetAsync('SELECT * FROM users WHERE id = ?', [userId]);

module.exports = { loadUserById, loadUserForProfileImage, loadUserForRead };
