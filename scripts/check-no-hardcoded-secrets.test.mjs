import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findCredentialedMongoUris,
  isPlaceholderCredential,
  parseMongoUserInfo,
  redactMongoUri,
  scanFiles,
} from './check-no-hardcoded-secrets.mjs';

function uri(user, password, host = 'cluster0.example.mongodb.net/devlabs') {
  return ['mongodb+srv://', user, ':', password, '@', host].join('');
}

describe('parseMongoUserInfo', () => {
  it('extracts userinfo from a credentialed host', () => {
    const parsed = parseMongoUserInfo('alice:s3cret@cluster.mongodb.net');
    assert.deepEqual(parsed, { user: 'alice', password: 's3cret' });
  });

  it('returns null when there is no userinfo', () => {
    assert.equal(parseMongoUserInfo('cluster.mongodb.net'), null);
  });
});

describe('isPlaceholderCredential', () => {
  it('accepts angle-bracket and generic placeholders', () => {
    assert.equal(isPlaceholderCredential('<user>'), true);
    assert.equal(isPlaceholderCredential('<password>'), true);
    assert.equal(isPlaceholderCredential('password'), true);
    assert.equal(isPlaceholderCredential('${MONGO_PASSWORD}'), true);
  });

  it('rejects values that look like real credentials', () => {
    assert.equal(isPlaceholderCredential('atlasUser123'), false);
    assert.equal(isPlaceholderCredential('n0tAPlaceholder!'), false);
  });
});

describe('findCredentialedMongoUris', () => {
  it('allows .env.example-style placeholders', () => {
    const sample = uri('<user>', '<password>', '<cluster>.mongodb.net/devlabs');
    assert.deepEqual(findCredentialedMongoUris(`MONGODB_URI=${sample}`), []);
  });

  it('flags a URI with a real username and password', () => {
    const sample = uri('alice', 's3cretPassw0rd');
    const hits = findCredentialedMongoUris(`const uri = '${sample}';`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].snippet.includes('s3cretPassw0rd'), false);
    assert.match(hits[0].snippet, /alice:\*\*\*@/);
  });

  it('flags a URI even when the password is URL-encoded', () => {
    const sample = uri('alice', 'p%40ss');
    assert.equal(findCredentialedMongoUris(sample).length, 1);
  });

  it('does not flag host-only mongodb URIs', () => {
    assert.deepEqual(findCredentialedMongoUris('mongodb://localhost:27017/devlabs'), []);
  });
});

describe('redactMongoUri', () => {
  it('strips the password from a reported snippet', () => {
    assert.equal(
      redactMongoUri(uri('alice', 's3cretPassw0rd')),
      uri('alice', '***')
    );
  });
});

describe('scanFiles', () => {
  it('reports file and line for a leaked URI', () => {
    const sample = uri('alice', 's3cretPassw0rd');
    const hits = scanFiles(['scripts/example.ts'], () => `// comment\n${sample}\n`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, 'scripts/example.ts');
    assert.equal(hits[0].line, 2);
  });

  it('skips lockfiles', () => {
    const sample = uri('alice', 's3cretPassw0rd');
    const hits = scanFiles(['pnpm-lock.yaml'], () => sample);
    assert.deepEqual(hits, []);
  });
});
