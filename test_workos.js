const { WorkOS } = require('@workos-inc/node');
const workos = new WorkOS('sk_test_123456', { clientId: 'client_123456' });
const url = workos.userManagement.getLogoutUrl({ sessionId: 'sess_123456' });
console.log(url);
