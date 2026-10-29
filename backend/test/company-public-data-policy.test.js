'use strict';

const assert = require('node:assert/strict');
const dns = require('node:dns');
const { describe, test } = require('node:test');

const {
  createCompanyPublicDataPolicy,
  parsePublicMediaOrigins
} = require('../src/application/catalog/company-public-data.policy');

describe('public company data policy', () => {
  test('parses only exact HTTPS media origins from an environment value', () => {
    assert.deepEqual(parsePublicMediaOrigins(undefined), []);
    assert.deepEqual(parsePublicMediaOrigins('   '), []);
    assert.deepEqual(
      parsePublicMediaOrigins('https://cdn.example.com, https://media.example.com:8443'),
      ['https://cdn.example.com', 'https://media.example.com:8443']
    );

    for (const invalid of [
      'http://cdn.example.com',
      'https://cdn.example.com/path',
      'https://cdn.example.com?variant=1',
      'https://cdn.example.com#logo',
      'https://user:password@cdn.example.com',
      'https://cdn.example.com,not-a-url'
    ]) {
      assert.throws(
        () => parsePublicMediaOrigins(invalid),
        (error) => error instanceof TypeError &&
          error.message === 'PUBLIC_MEDIA_ORIGINS is invalid'
      );
    }
  });

  test('presents a stable list item and fails closed for unsafe logos', () => {
    const policy = createCompanyPublicDataPolicy({
      publicMediaOrigins: ['https://cdn.example.com']
    });
    const base = {
      companyId: '7',
      name: 'Pedidos Express',
      pointCount: 185,
      municipalityCount: 42,
      matchRank: 0,
      normalizedName: 'pedidos express'
    };

    assert.deepEqual(policy.presentListItem({ ...base, logoUrl: '/uploads/logos/pe.webp' }), {
      companyId: '7',
      name: 'Pedidos Express',
      logoUrl: '/uploads/logos/pe.webp',
      pointCount: 185,
      municipalityCount: 42
    });
    assert.equal(
      policy.presentListItem({ ...base, logoUrl: 'https://cdn.example.com/pe.webp' }).logoUrl,
      'https://cdn.example.com/pe.webp'
    );

    for (const logoUrl of [
      '/other/logo.webp',
      '//evil.example/logo.webp',
      '/uploads/../secret.webp',
      '/uploads/./logo.webp',
      '/uploads\\logo.webp',
      '/uploads/logo.webp\nnext',
      'https://cdn.example.com.evil.test/logo.webp',
      'https://other.example/logo.webp',
      'http://cdn.example.com/logo.webp',
      'x'.repeat(2049)
    ]) {
      assert.equal(policy.presentListItem({ ...base, logoUrl }).logoUrl, null, logoUrl);
    }
  });

  test('normalizes optional description and website without exposing invalid legacy values', () => {
    const policy = createCompanyPublicDataPolicy({ publicMediaOrigins: [] });
    const base = rawProfile();

    assert.equal(policy.presentProfile({ ...base, description: 'Texto público.' }).description, 'Texto público.');
    assert.equal(policy.presentProfile({ ...base, description: null }).description, null);
    assert.equal(policy.presentProfile({ ...base, description: 'a'.repeat(500) }).description.length, 500);
    for (const description of [123, 'texto\u0000oculto', 'a'.repeat(501)]) {
      assert.equal(policy.presentProfile({ ...base, description }).description, null);
    }

    assert.equal(
      policy.presentProfile({ ...base, websiteUrl: 'https://example.com/path?ref=profile' }).websiteUrl,
      'https://example.com/path?ref=profile'
    );
    assert.equal(
      policy.presentProfile({ ...base, websiteUrl: 'https://8.8.8.8/profile' }).websiteUrl,
      'https://8.8.8.8/profile'
    );
    for (const websiteUrl of [
      'http://example.com',
      'https://user:password@example.com',
      'https://localhost/profile',
      'https://127.0.0.1/profile',
      'https://10.0.0.4/profile',
      'https://192.168.1.10/profile',
      'https://192.0.2.1/profile',
      'https://198.51.100.1/profile',
      'https://203.0.113.1/profile',
      'https://[::1]/profile',
      'not-a-url',
      'x'.repeat(2049)
    ]) {
      assert.equal(policy.presentProfile({ ...base, websiteUrl }).websiteUrl, null, websiteUrl);
    }
  });

  test('keeps only HTTPS social links on the official host for each platform', () => {
    const policy = createCompanyPublicDataPolicy({ publicMediaOrigins: [] });
    const profile = policy.presentProfile({
      ...rawProfile(),
      socialLinks: [
        { platform: 'INSTAGRAM', url: 'https://www.instagram.com/sivoy', order: 2 },
        { platform: 'FACEBOOK', url: 'https://m.facebook.com/sivoy', order: 1 },
        { platform: 'WHATSAPP', url: 'https://wa.me/50370000000', order: 3 },
        { platform: 'WHATSAPP', url: 'https://api.whatsapp.com/send?phone=50370000000', order: 4 },
        { platform: 'YOUTUBE', url: 'https://youtu.be/video', order: 5 },
        { platform: 'LINKEDIN', url: 'https://linkedin.com/company/sivoy', order: 6 },
        { platform: 'TIKTOK', url: 'https://tiktok.com/@sivoy', order: 7 },
        { platform: 'INSTAGRAM', url: 'http://instagram.com/sivoy', order: 8 },
        { platform: 'INSTAGRAM', url: 'https://instagram.com.evil.test/sivoy', order: 9 },
        { platform: 'WHATSAPP', url: 'javascript:alert(1)', order: 10 },
        { platform: 'UNKNOWN', url: 'https://example.com', order: 11 }
      ]
    });

    assert.deepEqual(profile.socialLinks, [
      { platform: 'FACEBOOK', url: 'https://m.facebook.com/sivoy', order: 1 },
      { platform: 'INSTAGRAM', url: 'https://www.instagram.com/sivoy', order: 2 },
      { platform: 'WHATSAPP', url: 'https://wa.me/50370000000', order: 3 },
      { platform: 'WHATSAPP', url: 'https://api.whatsapp.com/send?phone=50370000000', order: 4 },
      { platform: 'YOUTUBE', url: 'https://youtu.be/video', order: 5 },
      { platform: 'LINKEDIN', url: 'https://linkedin.com/company/sivoy', order: 6 },
      { platform: 'TIKTOK', url: 'https://tiktok.com/@sivoy', order: 7 }
    ]);
  });

  test('returns a stable profile shape without logging unsafe legacy values', (t) => {
    const logCalls = [];
    for (const method of ['error', 'warn', 'info', 'log']) {
      t.mock.method(console, method, (...args) => logCalls.push(args));
    }
    const policy = createCompanyPublicDataPolicy({ publicMediaOrigins: [] });

    assert.deepEqual(policy.presentProfile({
      ...rawProfile(),
      logoUrl: 'https://unconfigured.example/logo.webp',
      description: 'bad\u0085description',
      websiteUrl: 'file:///etc/passwd',
      socialLinks: [{ platform: 'FACEBOOK', url: 'data:text/html,bad', order: 0 }]
    }), {
      companyId: '42',
      name: 'Empresa de prueba',
      logoUrl: null,
      description: null,
      websiteUrl: null,
      socialLinks: [],
      coverage: { pointCount: 4, municipalityCount: 3, departmentCount: 2 }
    });
    assert.deepEqual(logCalls, []);
  });

  test('performs syntactic validation without fetch or DNS resolution', async (t) => {
    const fetch = t.mock.method(global, 'fetch', async () => {
      throw new Error('network access is forbidden');
    });
    const lookup = t.mock.method(dns, 'lookup', () => {
      throw new Error('DNS access is forbidden');
    });
    const resolve = t.mock.method(dns, 'resolve', () => {
      throw new Error('DNS access is forbidden');
    });
    const policy = createCompanyPublicDataPolicy({
      publicMediaOrigins: ['https://cdn.example.com']
    });

    const profile = policy.presentProfile(rawProfile());

    assert.equal(profile.websiteUrl, 'https://example.com');
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(lookup.mock.callCount(), 0);
    assert.equal(resolve.mock.callCount(), 0);
  });

  test('validates origins supplied directly to the policy factory', () => {
    assert.doesNotThrow(() => createCompanyPublicDataPolicy({
      publicMediaOrigins: ['https://cdn.example.com', 'https://media.example.com:8443']
    }));
    for (const origins of [
      'https://cdn.example.com',
      ['http://cdn.example.com'],
      ['https://cdn.example.com/path'],
      ['https://user:password@cdn.example.com']
    ]) {
      assert.throws(() => createCompanyPublicDataPolicy({ publicMediaOrigins: origins }), TypeError);
    }
  });
});

function rawProfile() {
  return {
    companyId: '42',
    name: 'Empresa de prueba',
    logoUrl: '/uploads/company.webp',
    description: 'Perfil público.',
    websiteUrl: 'https://example.com',
    socialLinks: [],
    coverage: { pointCount: 4, municipalityCount: 3, departmentCount: 2 }
  };
}
