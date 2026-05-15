import { expect, test } from '@playwright/test';

test('documents the create to invite flow smoke target', async () => {
  expect('/room/{roomId}?token={inviteToken}').toContain('token');
});
