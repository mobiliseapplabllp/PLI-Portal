const router = require('../src/routes/pm/pmConfig.routes');

let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l + '  ' + d); } };

// Walk the router's layer stack to find, for a given method+path, the FIRST
// authorize(...) middleware and test it directly against a mock req for a
// given role — bypasses needing a real JWT/HTTP server, same middleware fn.
function findAuthorizeMiddleware(method, pathSuffix) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const route = layer.route;
    if (!route.path.endsWith(pathSuffix) && route.path !== pathSuffix) continue;
    if (!route.methods[method.toLowerCase()]) continue;
    // route.stack = [ {handle: authorizeMw}, {handle: controllerFn} ] typically
    for (const s of route.stack) {
      if (s.handle.length === 3 && s.handle.name !== 'controllerFn') return s.handle; // (req,res,next) signature = middleware
    }
  }
  return null;
}

function testRole(method, path, role, expectAllowed, label) {
  const mw = findAuthorizeMiddleware(method, path);
  if (!mw) { check(label, false, 'route/middleware not found'); return; }
  let result = 'not called';
  mw({ user: { role } }, {}, (err) => { result = err ? `blocked: ${err.message}` : 'allowed'; });
  const allowed = result === 'allowed';
  check(label, allowed === expectAllowed, result);
}

console.log('=== project-types ===');
testRole('post', '/project-types', 'manager', false, 'manager BLOCKED from creating a project type');
testRole('post', '/project-types', 'admin',   true,  'admin ALLOWED to create a project type');
testRole('put',  '/project-types/:id', 'manager', false, 'manager BLOCKED from updating a project type');
testRole('delete','/project-types/:id', 'manager', false, 'manager BLOCKED from deleting a project type');

console.log('=== statuses ===');
testRole('post', '/statuses', 'manager', false, 'manager BLOCKED from creating a status');
testRole('post', '/statuses', 'admin',   true,  'admin ALLOWED to create a status');
testRole('put',  '/statuses/:id', 'manager', false, 'manager BLOCKED from updating a status');
testRole('delete','/statuses/:id', 'manager', false, 'manager BLOCKED from deleting a status');

console.log('=== milestone-templates ===');
testRole('post', '/milestone-templates', 'manager', false, 'manager BLOCKED from creating a milestone template');
testRole('post', '/milestone-templates', 'admin',   true,  'admin ALLOWED to create a milestone template');
testRole('put',  '/milestone-templates/:id', 'manager', false, 'manager BLOCKED from updating a milestone template');
testRole('delete','/milestone-templates/:id', 'manager', false, 'manager BLOCKED from deleting a milestone template');
testRole('put',  '/milestone-templates/reorder', 'manager', false, 'manager BLOCKED from reordering milestone templates');

console.log('=== member-roles ===');
testRole('post', '/member-roles', 'manager', false, 'manager BLOCKED from creating a member role');
testRole('post', '/member-roles', 'admin',   true,  'admin ALLOWED to create a member role');
testRole('put',  '/member-roles/:id', 'manager', false, 'manager BLOCKED from updating a member role');
testRole('delete','/member-roles/:id', 'manager', false, 'manager BLOCKED from deleting a member role');

console.log('=== reads stay open (regression check — should be unaffected) ===');
testRole('get', '/project-types', 'manager', true, 'manager still ALLOWED to read project types');
testRole('get', '/statuses', 'manager', true, 'manager still ALLOWED to read statuses');
testRole('get', '/member-roles', 'manager', true, 'manager still ALLOWED to read member roles');

console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
