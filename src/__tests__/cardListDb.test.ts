import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { MtgCardDatabase } from '../db/cardDb.js';
import {
  clearCloudCardListsForOwner,
  convertCardListEntriesToOracleIds,
  convertOracleEntriesToCardListIds,
  createCardList,
  deleteCardListPermanently,
  exportCardListToText,
  getCardList,
  importCardListEntries,
  listCardLists,
  saveCardList,
  softDeleteCardList,
} from '../db/cardListDb.js';
import type { CompactCard } from '../types/card.js';

function makeSampleCard(
  id: string,
  name: string,
  oracleId = `oracle-${id}`,
): CompactCard {
  return {
    id,
    oracleId,
    name,
    manaCost: '{2}',
    cmc: 2,
    typeLine: 'Artifact',
    oracleText: '',
    colors: [],
    colorIdentity: [],
    keywords: [],
    edhrecRank: 10,
    priceUsd: 2.0,
    imageNormal: '',
    imageSmall: '',
    layout: 'normal',
    isCommanderEligible: false,
    roles: [],
    themes: [],
  };
}

describe('cardListDb Binder/Wishlist/Trade/Package IndexedDB Persistence', () => {
  const createdDbs: MtgCardDatabase[] = [];

  function createTestDb(suffix: string): MtgCardDatabase {
    const db = new MtgCardDatabase(`mtg-cardlist-test-${suffix}-${Math.random().toString(36).slice(2)}`);
    createdDbs.push(db);
    return db;
  }

  afterEach(async () => {
    while (createdDbs.length > 0) {
      const db = createdDbs.pop()!;
      db.close();
      await db.delete();
    }
  });

  it('creates, saves, retrieves, filters, and sorts card lists across types', async () => {
    const db = createTestDb('crud');

    const binder = await createCardList(
      {
        id: 'list-binder',
        name: 'EDH Staples Binder',
        description: 'Owned Commander staples',
        listType: 'collection',
        entries: {
          'sol-ring': { quantity: 4, foilQuantity: 1, forTradeQuantity: 2, note: 'Extra copies' },
          'zero-card': { quantity: 0 },
        },
        visibility: 'private',
      },
      db,
    );

    expect(binder.id).toBe('list-binder');
    expect(binder.entries['zero-card']).toBeUndefined();
    expect(binder.entries['sol-ring']).toEqual({
      quantity: 4,
      foilQuantity: 1,
      forTradeQuantity: 2,
      note: 'Extra copies',
    });
    expect(binder.syncStatus).toBe('local');
    expect(binder.revision).toBe(0);

    const wishlist = await createCardList(
      {
        id: 'list-wish',
        name: 'Upgrade Wishlist',
        listType: 'wishlist',
        entries: { 'rhystic-study': { quantity: 1 } },
        visibility: 'friends',
      },
      db,
    );

    const pkg = await createCardList(
      {
        id: 'list-pkg',
        name: 'Aristocrats Core Package',
        listType: 'synergy-package',
        entries: { 'blood-artist': { quantity: 1 } },
        visibility: 'public',
      },
      db,
    );

    // Ensure deterministic updatedAt order for listing
    await saveCardList({ ...binder, updatedAt: '2026-11-14T10:00:00.000Z' }, db);
    await saveCardList({ ...wishlist, updatedAt: '2026-11-14T12:00:00.000Z' }, db);
    await saveCardList({ ...pkg, updatedAt: '2026-11-14T11:00:00.000Z' }, db);

    const fetched = await getCardList('list-binder', db);
    expect(fetched?.description).toBe('Owned Commander staples');

    const all = await listCardLists(db);
    expect(all.map((l) => l.id)).toEqual(['list-wish', 'list-pkg', 'list-binder']);

    const wishOnly = await listCardLists(db, { listType: 'wishlist' });
    expect(wishOnly.map((l) => l.id)).toEqual(['list-wish']);

    const pkgOnly = await listCardLists(db, { listType: 'synergy-package' });
    expect(pkgOnly.map((l) => l.id)).toEqual(['list-pkg']);
  });

  it('supports soft-delete tombstones, permanent delete, and owner-scoped cloud clearing', async () => {
    const db = createTestDb('tombstones-owner');

    await createCardList(
      { id: 'local-list', name: 'Local Binder', listType: 'collection', ownerUid: null },
      db,
    );
    await createCardList(
      {
        id: 'alice-trade',
        name: 'Alice Trades',
        listType: 'trade',
        ownerUid: 'uid-alice',
        visibility: 'friends',
      },
      db,
    );
    await createCardList(
      {
        id: 'alice-wish',
        name: 'Alice Wants',
        listType: 'wishlist',
        ownerUid: 'uid-alice',
      },
      db,
    );
    await createCardList(
      {
        id: 'bob-binder',
        name: 'Bob Binder',
        listType: 'collection',
        ownerUid: 'uid-bob',
      },
      db,
    );

    const tombstoned = await softDeleteCardList('alice-trade', db);
    expect(tombstoned).not.toBeNull();
    expect(tombstoned!.deletedAt).toBeTruthy();
    expect(tombstoned!.syncStatus).toBe('pending');
    expect(tombstoned!.updatedAt).toBe(tombstoned!.deletedAt);

    // Default listing hides soft-deleted lists
    const visible = await listCardLists(db);
    expect(visible.some((l) => l.id === 'alice-trade')).toBe(false);
    expect(visible).toHaveLength(3);

    // includeDeleted includes tombstones
    const withDeleted = await listCardLists(db, { includeDeleted: true });
    expect(withDeleted.some((l) => l.id === 'alice-trade')).toBe(true);
    expect(withDeleted).toHaveLength(4);

    // Clear all cloud lists for uid-alice (including tombstoned ones)
    const clearedCount = await clearCloudCardListsForOwner('uid-alice', db);
    expect(clearedCount).toBe(2);

    const afterOwnerClear = await listCardLists(db, { includeDeleted: true });
    expect(afterOwnerClear.map((l) => l.id).sort()).toEqual(['bob-binder', 'local-list']);

    // Permanent delete
    await deleteCardListPermanently('bob-binder', db);
    const remaining = await listCardLists(db, { includeDeleted: true });
    expect(remaining.map((l) => l.id)).toEqual(['local-list']);
  });

  it('exports and imports card list text cleanly including foils, trade counts, notes, and DFC names', async () => {
    const db = createTestDb('import-export');
    const solRing = makeSampleCard('id-sol', 'Sol Ring', 'ora-sol');
    const signet = makeSampleCard('id-signet', 'Arcane Signet', 'ora-signet');
    const balaGed = makeSampleCard(
      'id-bala',
      'Bala Ged Recovery // Bala Ged Sanctuary',
      'ora-bala',
    );

    const list = await createCardList(
      {
        id: 'list-export',
        name: 'Trade & Foil Binder',
        description: 'Commander staples',
        listType: 'trade',
        entries: {
          [solRing.id]: { quantity: 3, foilQuantity: 1, forTradeQuantity: 2, note: 'Near Mint' },
          [signet.id]: { quantity: 2, foilQuantity: 2 },
          [balaGed.id]: { quantity: 1, note: 'MDFC staple' },
        },
      },
      db,
    );

    const exported = exportCardListToText(list, {
      [solRing.id]: solRing,
      [signet.id]: signet,
      [balaGed.id]: balaGed,
    });

    expect(exported).toContain('// Name: Trade & Foil Binder');
    expect(exported).toContain('// Type: trade');
    expect(exported).toContain('2 Arcane Signet *F*');
    expect(exported).toContain('1 Bala Ged Recovery // Bala Ged Sanctuary // note: MDFC staple');
    expect(exported).toContain('3 Sol Ring #foil:1 #trade:2 // note: Near Mint');

    const imported = importCardListEntries(
      `${exported}\n1x Sol Ring *F*\n1 Unknown Mystery Card`,
      {
        'sol ring': solRing,
        'arcane signet': signet,
        'bala ged recovery // bala ged sanctuary': balaGed,
      },
    );

    expect(imported.name).toBe('Trade & Foil Binder');
    expect(imported.listType).toBe('trade');
    expect(imported.description).toBe('Commander staples');
    expect(imported.missingNames).toEqual(['Unknown Mystery Card']);
    expect(imported.entries[signet.id]).toEqual({ quantity: 2, foilQuantity: 2 });
    expect(imported.entries[balaGed.id]).toEqual({ quantity: 1, note: 'MDFC staple' });
    // Merged original 3 Sol Ring (#foil:1 #trade:2) + extra 1x Sol Ring *F*
    expect(imported.entries[solRing.id]).toEqual({
      quantity: 4,
      foilQuantity: 2,
      forTradeQuantity: 2,
      note: 'Near Mint',
    });
  });

  it('converts card list entries between local card IDs and canonical oracleIds', () => {
    const solC21 = makeSampleCard('sol-c21', 'Sol Ring', 'ora-sol');
    const solLea = makeSampleCard('sol-lea', 'Sol Ring', 'ora-sol');

    const oracleEntries = convertCardListEntriesToOracleIds(
      {
        'sol-c21': { quantity: 1, note: 'C21' },
        'sol-lea': { quantity: 1, foilQuantity: 1, forTradeQuantity: 1 },
      },
      { 'sol-c21': solC21, 'sol-lea': solLea },
    );

    expect(oracleEntries).toEqual({
      'ora-sol': {
        quantity: 2,
        foilQuantity: 1,
        forTradeQuantity: 1,
        note: 'C21',
      },
    });

    const localEntries = convertOracleEntriesToCardListIds(oracleEntries, {
      'ora-sol': solC21,
    });
    expect(localEntries).toEqual({
      'sol-c21': {
        quantity: 2,
        foilQuantity: 1,
        forTradeQuantity: 1,
        note: 'C21',
      },
    });
  });
});
