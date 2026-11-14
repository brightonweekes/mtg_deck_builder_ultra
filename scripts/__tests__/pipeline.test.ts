import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createGunzip, gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import type { ScryfallRawCard } from '../../src/types/card.js';
import {
  checkCommanderEligibility,
  checkMaxCopies,
  isCommanderPlayable,
  normalizeCard,
} from '../lib/card-normalizer.js';
import { normalizeCardText, stripReminderText, tagCard } from '../lib/method-a-tagger.js';
import {
  collectPaperBackfillIds,
  extractPaperOverridesFromStream,
  resolvePaperOverrides,
} from '../lib/paper-backfill.js';
import { parseJsonlStream } from '../lib/scryfall-fetcher.js';

function makeCard(overrides: Partial<ScryfallRawCard>): ScryfallRawCard {
  const hasFaces = Array.isArray(overrides.card_faces) && overrides.card_faces.length > 0;
  return {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000000',
    oracle_id: overrides.oracle_id ?? '11111111-1111-1111-1111-111111111111',
    name: 'Test Card',
    layout: 'normal',
    mana_cost: hasFaces ? undefined : '{1}',
    cmc: 1,
    type_line: hasFaces ? undefined : 'Artifact',
    oracle_text: hasFaces ? undefined : '',
    colors: [],
    color_identity: [],
    keywords: [],
    legalities: { commander: 'legal' },
    games: ['paper'],
    digital: false,
    edhrec_rank: 1000,
    prices: { usd: '1.25' },
    image_uris: hasFaces
      ? undefined
      : {
          small: 'https://cards.scryfall.io/small/front/a/b/test.jpg',
          normal: 'https://cards.scryfall.io/normal/front/a/b/test.jpg',
          art_crop: 'https://cards.scryfall.io/art_crop/front/a/b/test.jpg',
        },
    ...overrides,
  };
}

describe('Text preprocessing & reminder text stripping', () => {
  it('strips Extort reminder text from Crypt Ghast without leaking {W/B} or lifegain', () => {
    const cryptGhast = makeCard({
      name: 'Crypt Ghast',
      mana_cost: '{3}{B}',
      cmc: 4,
      type_line: 'Creature — Spirit',
      oracle_text:
        'Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)\nWhenever you tap a Swamp for mana, add an additional {B}.',
      colors: ['B'],
      color_identity: ['B'],
      keywords: ['Extort'],
    });

    const card = normalizeCard(cryptGhast);
    expect(card).not.toBeNull();
    expect(card!.colorIdentity).toEqual(['B']);
    expect(card!.roles).toContain('ramp');
    expect(card!.themes).not.toContain('lifegain');
    expect(card!.themes).not.toContain('burn');
  });

  it('strips nested or multiple reminder groups cleanly (Blind Obedience & Rebuild)', () => {
    const blindObedienceText =
      'Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)\nArtifacts and creatures your opponents control enter tapped.';
    expect(stripReminderText(blindObedienceText)).toBe(
      'Extort\nArtifacts and creatures your opponents control enter tapped.',
    );

    const rebuildText =
      'Return all artifacts to their owners\' hands.\nCycling {2} ({2}, Discard this card: Draw a card.)';
    expect(stripReminderText(rebuildText)).toBe(
      'Return all artifacts to their owners\' hands.\nCycling {2}',
    );
  });

  it('normalizes self-references including legendary short names and modern "this creature" phrasing', () => {
    const normalized = normalizeCardText(
      'Whenever Korvold, Fae-Cursed King enters or attacks, sacrifice another permanent. Korvold gets +1/+1.',
      'Korvold, Fae-Cursed King',
    );
    expect(normalized).toContain('whenever ~ enters or attacks');
    expect(normalized).toContain('~ gets +1/+1');

    const modern = normalizeCardText(
      'When this creature enters, draw two cards.',
      'Mulldrifter',
    );
    expect(modern).toBe('when ~ enters, draw two cards.');
  });
});

describe('Legality filtering & multi-face normalization', () => {
  it('filters out banned, digital-only, token, and art-series cards while keeping MTGO/Arena prints of Commander-legal cards', () => {
    expect(
      isCommanderPlayable(makeCard({ legalities: { commander: 'banned' } })),
    ).toBe(false);
    expect(isCommanderPlayable(makeCard({ layout: 'token' }))).toBe(false);
    expect(isCommanderPlayable(makeCard({ layout: 'art_series' }))).toBe(false);
    // True Arena/Alchemy digital-only cards are not legal in Commander
    expect(
      isCommanderPlayable(
        makeCard({ legalities: { commander: 'not_legal' }, digital: true, games: ['arena'] }),
      ),
    ).toBe(false);
    // Commander-legal cards whose oracle-cards entry is an MTGO/Arena remaster (Timetwister vma, Pyrogoyf aa2) stay playable
    expect(
      isCommanderPlayable(
        makeCard({ legalities: { commander: 'legal' }, digital: true, games: ['mtgo'] }),
      ),
    ).toBe(true);
    expect(
      isCommanderPlayable(
        makeCard({ legalities: { commander: 'legal' }, digital: true, games: ['arena'] }),
      ),
    ).toBe(true);
    expect(
      isCommanderPlayable(makeCard({ digital: false, games: ['paper', 'mtgo'] })),
    ).toBe(true);
  });

  it('normalizes modal_dfc (Esika // The Prismatic Bridge)', () => {
    const esika = makeCard({
      name: 'Esika, God of the Tree // The Prismatic Bridge',
      layout: 'modal_dfc',
      cmc: 3,
      color_identity: ['W', 'U', 'B', 'R', 'G'],
      colors: undefined,
      image_uris: undefined,
      card_faces: [
        {
          name: 'Esika, God of the Tree',
          mana_cost: '{1}{G}{G}',
          type_line: 'Legendary Creature — God',
          oracle_text:
            'Vigilance\n{T}: Add one mana of any color.\nOther legendary creatures you control have vigilance and "{T}: Add one mana of any color."',
          colors: ['G'],
          power: '1',
          toughness: '4',
          image_uris: {
            small: 'https://cards.scryfall.io/small/front/esika.jpg',
            normal: 'https://cards.scryfall.io/normal/front/esika.jpg',
            art_crop: 'https://cards.scryfall.io/art_crop/front/esika.jpg',
          },
        },
        {
          name: 'The Prismatic Bridge',
          mana_cost: '{W}{U}{B}{R}{G}',
          type_line: 'Legendary Enchantment',
          oracle_text:
            'At the beginning of your upkeep, reveal cards from the top of your library until you reveal a creature or planeswalker card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.',
          colors: ['W', 'U', 'B', 'R', 'G'],
          image_uris: {
            small: 'https://cards.scryfall.io/small/back/bridge.jpg',
            normal: 'https://cards.scryfall.io/normal/back/bridge.jpg',
          },
        },
      ],
    });

    const card = normalizeCard(esika);
    expect(card).not.toBeNull();
    expect(card!.isCommanderEligible).toBe(true);
    expect(card!.colorIdentity).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(card!.colors).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(card!.imageNormal).toBe('https://cards.scryfall.io/normal/front/esika.jpg');
    expect(card!.faces).toHaveLength(2);
    expect(card!.faces![1]!.imageNormal).toBe('https://cards.scryfall.io/normal/back/bridge.jpg');
    expect(card!.roles).toContain('ramp');
  });

  it('normalizes adventure (Bonecrusher Giant // Stomp), split (Fire // Ice), and transform (Delver)', () => {
    const bonecrusher = normalizeCard(
      makeCard({
        name: 'Bonecrusher Giant // Stomp',
        layout: 'adventure',
        cmc: 3,
        colors: ['R'],
        color_identity: ['R'],
        card_faces: [
          {
            name: 'Bonecrusher Giant',
            mana_cost: '{2}{R}',
            type_line: 'Creature — Giant',
            oracle_text:
              'Whenever Bonecrusher Giant becomes the target of a spell, Bonecrusher Giant deals 2 damage to that spell\'s controller.',
            power: '4',
            toughness: '3',
          },
          {
            name: 'Stomp',
            mana_cost: '{1}{R}',
            type_line: 'Instant — Adventure',
            oracle_text:
              'Damage can\'t be prevented this turn.\nStomp deals 2 damage to any target.',
          },
        ],
      }),
    );
    expect(bonecrusher!.faces).toHaveLength(2);
    expect(bonecrusher!.roles).toContain('removal');
    expect(bonecrusher!.isCommanderEligible).toBe(false);

    const fireIce = normalizeCard(
      makeCard({
        name: 'Fire // Ice',
        layout: 'split',
        cmc: 4,
        colors: ['U', 'R'],
        color_identity: ['U', 'R'],
        card_faces: [
          {
            name: 'Fire',
            mana_cost: '{1}{R}',
            type_line: 'Instant',
            oracle_text: 'Fire deals 2 damage divided as you choose among one or two targets.',
          },
          {
            name: 'Ice',
            mana_cost: '{1}{U}',
            type_line: 'Instant',
            oracle_text: 'Tap target permanent.\nDraw a card.',
          },
        ],
      }),
    );
    expect(fireIce!.faces).toHaveLength(2);
    expect(fireIce!.manaCost).toBe('{1}{R} // {1}{U}');

    const delver = normalizeCard(
      makeCard({
        name: 'Delver of Secrets // Insectile Aberration',
        layout: 'transform',
        cmc: 1,
        color_identity: ['U'],
        image_uris: undefined,
        card_faces: [
          {
            name: 'Delver of Secrets',
            mana_cost: '{U}',
            type_line: 'Creature — Human Wizard',
            oracle_text:
              'At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.',
            colors: ['U'],
            power: '1',
            toughness: '1',
            image_uris: {
              small: 'https://cards.scryfall.io/small/front/delver.jpg',
              normal: 'https://cards.scryfall.io/normal/front/delver.jpg',
            },
          },
          {
            name: 'Insectile Aberration',
            mana_cost: '',
            type_line: 'Creature — Human Insect',
            oracle_text: 'Flying',
            colors: ['U'],
            power: '3',
            toughness: '2',
            image_uris: {
              small: 'https://cards.scryfall.io/small/back/insectile.jpg',
              normal: 'https://cards.scryfall.io/normal/back/insectile.jpg',
            },
          },
        ],
      }),
    );
    expect(delver!.imageNormal).toBe('https://cards.scryfall.io/normal/front/delver.jpg');
    expect(delver!.faces![1]!.imageNormal).toBe('https://cards.scryfall.io/normal/back/insectile.jpg');
  });

  it('normalizes flip cards and excludes non-legendary front faces like Bushi Tenderfoot', () => {
    const bushi = normalizeCard(
      makeCard({
        name: 'Bushi Tenderfoot // Kenzo the Hardhearted',
        layout: 'flip',
        cmc: 1,
        colors: ['W'],
        color_identity: ['W'],
        card_faces: [
          {
            name: 'Bushi Tenderfoot',
            mana_cost: '{W}',
            type_line: 'Creature — Human Soldier',
            oracle_text:
              'When a creature dealt damage by Bushi Tenderfoot this turn dies, flip it.',
            power: '1',
            toughness: '1',
          },
          {
            name: 'Kenzo the Hardhearted',
            mana_cost: '',
            type_line: 'Legendary Creature — Human Samurai',
            oracle_text: 'Double strike; bushido 2',
            power: '3',
            toughness: '4',
          },
        ],
      }),
    );

    expect(bushi).not.toBeNull();
    expect(bushi!.isCommanderEligible).toBe(false);
  });
});

describe('Commander eligibility & partner pairing', () => {
  it('detects standard Legendary Creature, Vehicle, Grist, and Planeswalker commanders', () => {
    const kenrith = normalizeCard(
      makeCard({
        name: 'Kenrith, the Returned King',
        mana_cost: '{4}{W}',
        cmc: 5,
        type_line: 'Legendary Creature — Human Noble',
        oracle_text: '{R}: All creatures gain trample and haste until end of turn.\n{3}{U}: Target player draws a card.',
        colors: ['W'],
        color_identity: ['W', 'U', 'B', 'R', 'G'],
      }),
    );
    expect(kenrith!.isCommanderEligible).toBe(true);
    expect(kenrith!.colorIdentity).toEqual(['W', 'U', 'B', 'R', 'G']);

    const shorikai = normalizeCard(
      makeCard({
        name: 'Shorikai, Genesis Engine',
        mana_cost: '{2}{W}{U}',
        cmc: 4,
        type_line: 'Legendary Artifact — Vehicle',
        power: '8',
        toughness: '8',
        oracle_text:
          '{1}, {T}: Draw two cards, then discard a card. Create a 1/1 colorless Pilot creature token.\nCrew 8\nShorikai, Genesis Engine can be your commander.',
        colors: ['W', 'U'],
        color_identity: ['W', 'U'],
      }),
    );
    expect(shorikai!.isCommanderEligible).toBe(true);
    expect(shorikai!.roles).toContain('draw');
    expect(shorikai!.themes).toContain('token-generator');

    const grist = normalizeCard(
      makeCard({
        name: 'Grist, the Hunger Tide',
        mana_cost: '{1}{B}{G}',
        cmc: 3,
        type_line: 'Legendary Planeswalker — Grist',
        oracle_text:
          "As long as Grist, the Hunger Tide isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types.\n+1: Create a 1/1 black and green Insect creature token, then mill a card.",
        colors: ['B', 'G'],
        color_identity: ['B', 'G'],
      }),
    );
    expect(grist!.isCommanderEligible).toBe(true);

    const freyalise = normalizeCard(
      makeCard({
        name: "Freyalise, Llanowar's Fury",
        mana_cost: '{3}{G}{G}',
        cmc: 5,
        type_line: 'Legendary Planeswalker — Freyalise',
        oracle_text:
          '+2: Create a 1/1 green Elf Druid creature token with "{T}: Add {G}."\nFreyalise, Llanowar\'s Fury can be your commander.',
        colors: ['G'],
        color_identity: ['G'],
      }),
    );
    expect(freyalise!.isCommanderEligible).toBe(true);
  });

  it('detects all 2-commander pairing types accurately', () => {
    const thrasios = normalizeCard(
      makeCard({
        name: 'Thrasios, Triton Hero',
        type_line: 'Legendary Creature — Merfolk Wizard',
        oracle_text:
          '{4}: Scry 1, then reveal the top card of your library. If it\'s a land card, put it onto the battlefield tapped. Otherwise, draw a card.\nPartner (You can have two commanders if both have partner.)',
        keywords: ['Partner'],
      }),
    );
    expect(thrasios!.partnerType).toBe('partner');

    const pir = normalizeCard(
      makeCard({
        name: 'Pir, Imaginative Rascal',
        type_line: 'Legendary Creature — Human',
        oracle_text:
          'Partner with Toothy, Imaginary Friend (When this creature enters, target player may put Toothy into their hand from their library, then shuffle.)\nIf one or more counters would be put on a permanent your team controls, that many plus one of each of those kinds of counters are put on that permanent instead.',
      }),
    );
    expect(pir!.partnerType).toBe('partner-with');
    expect(pir!.partnerWithName).toBe('Toothy, Imaginary Friend');

    const wilson = normalizeCard(
      makeCard({
        name: 'Wilson, Refined Grizzly',
        type_line: 'Legendary Creature — Bear Warrior',
        oracle_text:
          "Vigilance, reach, trample\nWilson, Refined Grizzly can't be countered.\nChoose a Background (You can have a Background as a second commander.)",
      }),
    );
    expect(wilson!.partnerType).toBe('choose-background');

    const flamingFist = normalizeCard(
      makeCard({
        name: 'Flaming Fist',
        type_line: 'Legendary Enchantment — Background',
        oracle_text: 'Commander creatures you own have "Whenever this creature attacks, it gains double strike until end of turn."',
      }),
    );
    expect(flamingFist!.isCommanderEligible).toBe(true);
    expect(flamingFist!.partnerType).toBe('background');

    const tenthDoctor = normalizeCard(
      makeCard({
        name: 'The Tenth Doctor',
        type_line: 'Legendary Creature — Time Lord Doctor',
        oracle_text: 'Whenever you attack, exile the top card of your library with three time counters on it.',
      }),
    );
    expect(tenthDoctor!.partnerType).toBe('time-lord-doctor');

    const sarahJane = normalizeCard(
      makeCard({
        name: 'Sarah Jane Smith',
        type_line: 'Legendary Creature — Human Detective',
        oracle_text: "Whenever you cast a historic spell, investigate.\nDoctor's companion (You can have two commanders if the other is the Doctor.)",
      }),
    );
    expect(sarahJane!.partnerType).toBe('doctors-companion');

    const eleven = checkCommanderEligibility(
      makeCard({ name: 'Eleven, the Mage', type_line: 'Legendary Creature — Human Wizard' }),
      'Legendary Creature — Human Wizard',
      'Friends forever (You can have two commanders if both have friends forever.)',
      'Friends forever (You can have two commanders if both have friends forever.)',
    );
    expect(eleven.partnerType).toBe('friends-forever');
  });
});

describe('Singleton exceptions (maxCopies)', () => {
  it('handles unlimited basic lands, unlimited special cards, 7/9-copy cards, and default singleton', () => {
    expect(checkMaxCopies('Basic Land — Plains', '{T}: Add {W}.')).toBeNull();
    expect(
      checkMaxCopies(
        'Creature — Rat',
        'Relentless Rats gets +1/+1 for each other creature on the battlefield named Relentless Rats.\nA deck can have any number of cards named Relentless Rats.',
      ),
    ).toBeNull();
    expect(
      checkMaxCopies(
        'Sorcery',
        "Dragon's Approach deals 3 damage to each opponent.\nA deck can have any number of cards named Dragon's Approach.",
      ),
    ).toBeNull();
    expect(
      checkMaxCopies(
        'Creature — Dwarf Noble',
        'A deck can have up to seven cards named Seven Dwarves.',
      ),
    ).toBe(7);
    expect(
      checkMaxCopies(
        'Creature — Wraith Knight',
        'Deathtouch\nA deck can have up to nine cards named Nazgûl.',
      ),
    ).toBe(9);
    expect(checkMaxCopies('Artifact', '{T}: Add {C}{C}.')).toBeUndefined();
  });
});

describe('Method A Functional Roles', () => {
  it('tags ramp accurately without tagging basic lands as ramp', () => {
    const solRing = tagCard({
      name: 'Sol Ring',
      typeLine: 'Artifact',
      oracleText: '{T}: Add {C}{C}.',
      cmc: 1,
      keywords: [],
    });
    expect(solRing.roles).toContain('ramp');

    const arcaneSignet = tagCard({
      name: 'Arcane Signet',
      typeLine: 'Artifact',
      oracleText: "{T}: Add one mana of any color in your commander's color identity.",
      cmc: 2,
      keywords: [],
    });
    expect(arcaneSignet.roles).toContain('ramp');

    const cultivate = tagCard({
      name: 'Cultivate',
      typeLine: 'Sorcery',
      oracleText:
        'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.',
      cmc: 3,
      keywords: [],
    });
    expect(cultivate.roles).toContain('ramp');
    expect(cultivate.roles).not.toContain('tutor');

    const forest = tagCard({
      name: 'Forest',
      typeLine: 'Basic Land — Forest',
      oracleText: '({T}: Add {G}.)',
      cmc: 0,
      keywords: [],
    });
    expect(forest.roles).not.toContain('ramp');
  });

  it('tags tutor vs. ramp cleanly', () => {
    const demonicTutor = tagCard({
      name: 'Demonic Tutor',
      typeLine: 'Sorcery',
      oracleText: 'Search your library for a card, put that card into your hand, then shuffle.',
      cmc: 2,
      keywords: [],
    });
    expect(demonicTutor.roles).toContain('tutor');
    expect(demonicTutor.roles).not.toContain('ramp');
  });

  it('distinguishes repeatable/multi-card draw from 1-mana cantrips', () => {
    const rhysticStudy = tagCard({
      name: 'Rhystic Study',
      typeLine: 'Enchantment',
      oracleText: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
      cmc: 3,
      keywords: [],
    });
    expect(rhysticStudy.roles).toContain('draw');

    const mysticRemora = tagCard({
      name: 'Mystic Remora',
      typeLine: 'Enchantment',
      oracleText:
        'Cumulative upkeep {1}\nWhenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.',
      cmc: 1,
      keywords: ['Cumulative upkeep'],
    });
    expect(mysticRemora.roles).toContain('draw');

    const ponder = tagCard({
      name: 'Ponder',
      typeLine: 'Sorcery',
      oracleText:
        'Look at the top three cards of your library, then you may shuffle. Draw a card.',
      cmc: 1,
      keywords: [],
    });
    expect(ponder.roles).not.toContain('draw');
    expect(ponder.themes).toContain('cantrip');
  });

  it('tags removal, wipes (including Overload), recursion, and protection accurately', () => {
    const swords = tagCard({
      name: 'Swords to Plowshares',
      typeLine: 'Instant',
      oracleText: 'Exile target creature. Its controller gains life equal to its power.',
      cmc: 1,
      keywords: [],
    });
    expect(swords.roles).toContain('removal');

    const counterspell = tagCard({
      name: 'Counterspell',
      typeLine: 'Instant',
      oracleText: 'Counter target spell.',
      cmc: 2,
      keywords: [],
    });
    expect(counterspell.roles).toContain('removal');
    expect(counterspell.themes).not.toContain('counters');

    const beastWithin = tagCard({
      name: 'Beast Within',
      typeLine: 'Instant',
      oracleText: 'Destroy target permanent. Its controller creates a 3/3 green Beast creature token.',
      cmc: 3,
      keywords: [],
    });
    expect(beastWithin.roles).toContain('removal');

    const wrath = tagCard({
      name: 'Wrath of God',
      typeLine: 'Sorcery',
      oracleText: "Destroy all creatures. They can't be regenerated.",
      cmc: 4,
      keywords: [],
    });
    expect(wrath.roles).toContain('wipe');

    const toxicDeluge = tagCard({
      name: 'Toxic Deluge',
      typeLine: 'Sorcery',
      oracleText:
        'As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.',
      cmc: 3,
      keywords: [],
    });
    expect(toxicDeluge.roles).toContain('wipe');

    const cyclonicRift = tagCard({
      name: 'Cyclonic Rift',
      typeLine: 'Instant',
      oracleText:
        "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change 'target' in its text to 'each'.)",
      cmc: 2,
      keywords: ['Overload'],
    });
    expect(cyclonicRift.roles).toContain('removal');
    expect(cyclonicRift.roles).toContain('wipe');

    const eternalWitness = tagCard({
      name: 'Eternal Witness',
      typeLine: 'Creature — Human Shaman',
      oracleText: 'When Eternal Witness enters, you may return target card from your graveyard to your hand.',
      cmc: 3,
      keywords: [],
    });
    expect(eternalWitness.roles).toContain('recursion');
    expect(eternalWitness.themes).toContain('etb-trigger');

    const reanimate = tagCard({
      name: 'Reanimate',
      typeLine: 'Sorcery',
      oracleText:
        'Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to its mana value.',
      cmc: 1,
      keywords: [],
    });
    expect(reanimate.roles).toContain('recursion');
    expect(reanimate.themes).toContain('reanimator');
    expect(reanimate.themes).toContain('graveyard');

    const heroicIntervention = tagCard({
      name: 'Heroic Intervention',
      typeLine: 'Instant',
      oracleText: 'Permanents you control gain hexproof and indestructible until end of turn.',
      cmc: 2,
      keywords: [],
    });
    expect(heroicIntervention.roles).toContain('protection');

    const teferisProtection = tagCard({
      name: "Teferi's Protection",
      typeLine: 'Instant',
      oracleText:
        "Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out.",
      cmc: 3,
      keywords: [],
    });
    expect(teferisProtection.roles).toContain('protection');
  });
});

describe('Method A Mechanical Themes & Sub-Roles', () => {
  it('tags aristocrats, sacrifice outlets, tokens, counters, blink, enchantress, spellslinger, lifegain, landfall, wheels, and stax', () => {
    const visceraSeer = tagCard({
      name: 'Viscera Seer',
      typeLine: 'Creature — Vampire Wizard',
      oracleText: 'Sacrifice a creature: Scry 1.',
      cmc: 1,
      keywords: [],
    });
    expect(visceraSeer.themes).toContain('sacrifice');
    expect(visceraSeer.themes).toContain('sac-outlet');

    const zulaport = tagCard({
      name: 'Zulaport Cutthroat',
      typeLine: 'Creature — Human Rogue Ally',
      oracleText:
        'Whenever Zulaport Cutthroat or another creature you control dies, each opponent loses 1 life and you gain 1 life.',
      cmc: 2,
      keywords: [],
    });
    expect(zulaport.themes).toContain('sacrifice');
    expect(zulaport.themes).toContain('death-trigger');
    expect(zulaport.themes).toContain('aristocrats');

    const korvold = tagCard({
      name: 'Korvold, Fae-Cursed King',
      typeLine: 'Legendary Creature — Dragon Noble',
      oracleText:
        'Flying\nWhenever Korvold, Fae-Cursed King enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold, Fae-Cursed King and draw a card.',
      cmc: 5,
      keywords: ['Flying'],
    });
    expect(korvold.roles).toContain('draw');
    expect(korvold.themes).toContain('sacrifice');
    expect(korvold.themes).toContain('plus-one-counters');
    expect(korvold.themes).toContain('attack-trigger');

    const doublingSeason = tagCard({
      name: 'Doubling Season',
      typeLine: 'Enchantment',
      oracleText:
        'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.',
      cmc: 5,
      keywords: [],
    });
    expect(doublingSeason.themes).toContain('tokens');
    expect(doublingSeason.themes).toContain('token-payoff');
    expect(doublingSeason.themes).toContain('counters');

    const hardenedScales = tagCard({
      name: 'Hardened Scales',
      typeLine: 'Enchantment',
      oracleText:
        'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.',
      cmc: 1,
      keywords: [],
    });
    expect(hardenedScales.themes).toContain('plus-one-counters');
    expect(hardenedScales.themes).toContain('counters');

    const ephemerate = tagCard({
      name: 'Ephemerate',
      typeLine: 'Instant',
      oracleText:
        "Exile target creature you control, then return it to the battlefield under its owner's control.\nRebound",
      cmc: 1,
      keywords: ['Rebound'],
    });
    expect(ephemerate.themes).toContain('blink');
    expect(ephemerate.roles).not.toContain('removal');

    const panharmonicon = tagCard({
      name: 'Panharmonicon',
      typeLine: 'Artifact',
      oracleText:
        'If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.',
      cmc: 4,
      keywords: [],
    });
    expect(panharmonicon.themes).toContain('panharmonicon');

    const sythis = tagCard({
      name: "Sythis, Harvest's Hand",
      typeLine: 'Legendary Enchantment Creature — Nymph',
      oracleText: 'Whenever you cast an enchantment spell, you gain 1 life and draw a card.',
      cmc: 2,
      keywords: [],
    });
    expect(sythis.roles).toContain('draw');
    expect(sythis.themes).toContain('enchantress');
    expect(sythis.themes).toContain('lifegain');

    const guttersnipe = tagCard({
      name: 'Guttersnipe',
      typeLine: 'Creature — Goblin Shaman',
      oracleText:
        'Whenever you cast an instant or sorcery spell, Guttersnipe deals 2 damage to each opponent.',
      cmc: 3,
      keywords: [],
    });
    expect(guttersnipe.themes).toContain('spellslinger');
    expect(guttersnipe.themes).toContain('magecraft');
    expect(guttersnipe.themes).toContain('burn');

    const aetherflux = tagCard({
      name: 'Aetherflux Reservoir',
      typeLine: 'Artifact',
      oracleText:
        "Whenever you cast a spell, you gain 1 life for each spell you've cast this turn.\nPay 50 life: Aetherflux Reservoir deals 50 damage to any target.",
      cmc: 4,
      keywords: [],
    });
    expect(aetherflux.themes).toContain('lifegain');
    expect(aetherflux.themes).toContain('lifegain-payoff');

    const avenger = tagCard({
      name: 'Avenger of Zendikar',
      typeLine: 'Creature — Elemental',
      oracleText:
        'When Avenger of Zendikar enters, create a 0/1 green Plant creature token for each land you control.\nLandfall — Whenever a land you control enters, you may put a +1/+1 counter on each Plant creature you control.',
      cmc: 7,
      keywords: ['Landfall'],
    });
    expect(avenger.themes).toContain('landfall');
    expect(avenger.themes).toContain('lands-matter');
    expect(avenger.themes).toContain('token-generator');
    expect(avenger.themes).toContain('plus-one-counters');

    const windfall = tagCard({
      name: 'Windfall',
      typeLine: 'Sorcery',
      oracleText:
        'Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.',
      cmc: 3,
      keywords: [],
    });
    expect(windfall.roles).toContain('draw');
    expect(windfall.themes).toContain('wheels');
    expect(windfall.themes).toContain('discard');

    const drannith = tagCard({
      name: 'Drannith Magistrate',
      typeLine: 'Creature — Human Wizard',
      oracleText: "Your opponents can't cast spells from anywhere other than their hands.",
      cmc: 2,
      keywords: [],
    });
    expect(drannith.themes).toContain('stax');
  });
});

describe('Pipeline throughput performance', () => {
  it('normalizes and tags 30,000 cards in under 3,000 ms', () => {
    const sampleRaw = makeCard({
      name: 'Korvold, Fae-Cursed King',
      mana_cost: '{2}{B}{R}{G}',
      cmc: 5,
      type_line: 'Legendary Creature — Dragon Noble',
      oracle_text:
        'Flying\nWhenever Korvold, Fae-Cursed King enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold, Fae-Cursed King and draw a card.',
      colors: ['B', 'R', 'G'],
      color_identity: ['B', 'R', 'G'],
      keywords: ['Flying'],
    });

    const start = performance.now();
    let count = 0;
    for (let i = 0; i < 30_000; i++) {
      const normalized = normalizeCard(sampleRaw);
      if (normalized) count++;
    }
    const elapsedMs = performance.now() - start;

    expect(count).toBe(30_000);
    expect(elapsedMs).toBeLessThan(3000);
  });
});

describe('JSONL bulk stream parsing', () => {
  it('parses gzipped JSONL streams cleanly and skips blank lines', async () => {
    const c1 = makeCard({ id: 'card-1', name: 'Sol Ring', oracle_text: '{T}: Add {C}{C}.' });
    const c2 = makeCard({ id: 'card-2', name: 'Arcane Signet', oracle_text: '{T}: Add one mana of any color.' });
    const jsonlPayload = `${JSON.stringify(c1)}\n\n  \n${JSON.stringify(c2)}\n`;
    const gzBuffer = gzipSync(Buffer.from(jsonlPayload, 'utf8'));

    const stream = Readable.from(gzBuffer).pipe(createGunzip());
    const parsed = await parseJsonlStream(stream);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.name).toBe('Sol Ring');
    expect(parsed[1]!.name).toBe('Arcane Signet');
  });
});

describe('BUG-001 paper price & artwork backfill', () => {
  it('targets MTGO/non-paper representatives and null-priced paper cards while skipping normal priced cards', () => {
    const solRing = makeCard({ oracle_id: 'oid-sol', name: 'Sol Ring', games: ['paper'], digital: false, prices: { usd: '1.50' } });
    const timetwister = makeCard({ oracle_id: 'oid-twister', name: 'Timetwister', games: ['mtgo'], digital: true, prices: { usd: null } });
    const crucibleNac = makeCard({ oracle_id: 'oid-crucible', name: 'Crucible of Worlds', games: [], digital: false, prices: { usd: null } });
    const summerSacrifice = makeCard({ oracle_id: 'oid-sac', name: 'Sacrifice', games: ['paper'], digital: false, prices: { usd: null } });
    const bannedLotus = makeCard({ oracle_id: 'oid-lotus', name: 'Black Lotus', legalities: { commander: 'banned' }, games: ['mtgo'], digital: true, prices: { usd: null } });

    const targets = collectPaperBackfillIds([
      solRing,
      timetwister,
      crucibleNac,
      summerSacrifice,
      bannedLotus,
    ]);

    expect(targets.has('oid-sol')).toBe(false);
    expect(targets.has('oid-lotus')).toBe(false);
    expect(targets.has('oid-twister')).toBe(true);
    expect(targets.has('oid-crucible')).toBe(true);
    expect(targets.has('oid-sac')).toBe(true);
  });

  it('extracts lowest tournament-legal USD price and clean paper artwork from default-cards streams', async () => {
    const printings: ScryfallRawCard[] = [
      // Unrelated card must be ignored
      makeCard({ oracle_id: 'oid-other', name: 'Unrelated', prices: { usd: '99.99' } }),
      // Collectors Edition memorabilia must be ignored even if cheap
      makeCard({
        oracle_id: 'oid-usea',
        name: 'Underground Sea',
        set: 'ced',
        set_type: 'memorabilia',
        games: ['paper'],
        digital: false,
        released_at: '1993-12-10',
        prices: { usd: '120.00' },
      }),
      // Oversized & digital printings must be ignored
      makeCard({
        oracle_id: 'oid-usea',
        name: 'Underground Sea',
        set: 'vma',
        games: ['mtgo'],
        digital: true,
        prices: { usd: '1.00' },
      }),
      makeCard({
        oracle_id: 'oid-usea',
        name: 'Underground Sea',
        set: 'ovnt',
        oversized: true,
        games: ['paper'],
        digital: false,
        prices: { usd: '50.00' },
      }),
      // Beta: black border high-res scan, higher price ($4,200)
      makeCard({
        oracle_id: 'oid-usea',
        name: 'Underground Sea',
        set: 'leb',
        games: ['paper'],
        digital: false,
        border_color: 'black',
        promo: false,
        image_status: 'highres_scan',
        released_at: '1993-10-04',
        prices: { usd: '4200.00' },
        image_uris: {
          small: 'https://cards.scryfall.io/small/front/leb-usea.jpg',
          normal: 'https://cards.scryfall.io/normal/front/leb-usea.jpg',
          art_crop: 'https://cards.scryfall.io/art_crop/front/leb-usea.jpg',
        },
      }),
      // Revised: white border, cheapest regular tournament paper USD ($780)
      makeCard({
        oracle_id: 'oid-usea',
        name: 'Underground Sea',
        set: '3ed',
        games: ['paper'],
        digital: false,
        border_color: 'white',
        promo: false,
        image_status: 'highres_scan',
        released_at: '1994-04-01',
        prices: { usd: '780.00', usd_foil: '2500.00' },
        image_uris: {
          small: 'https://cards.scryfall.io/small/front/3ed-usea.jpg',
          normal: 'https://cards.scryfall.io/normal/front/3ed-usea.jpg',
        },
      }),
      // Foil-only paper card fallback when regular `usd` is null
      makeCard({
        oracle_id: 'oid-foil-only',
        name: 'Foil Only Judge Card',
        set: 'j20',
        games: ['paper'],
        digital: false,
        promo: true,
        border_color: 'black',
        image_status: 'highres_scan',
        released_at: '2020-01-01',
        prices: { usd: null, usd_foil: '42.50', usd_etched: '55.00' },
        image_uris: {
          small: 'https://cards.scryfall.io/small/front/j20.jpg',
          normal: 'https://cards.scryfall.io/normal/front/j20.jpg',
        },
      }),
    ];

    const jsonl = `${printings.map((p) => JSON.stringify(p)).join('\n')}\n`;
    const targets = new Set(['oid-usea', 'oid-foil-only']);
    const overrides = await extractPaperOverridesFromStream(Readable.from(jsonl), targets);

    expect(overrides['oid-other']).toBeUndefined();
    expect(overrides['oid-usea']!.priceUsd).toBe(780);
    expect(overrides['oid-usea']!.imageNormal).toBe('https://cards.scryfall.io/normal/front/leb-usea.jpg');
    expect(overrides['oid-usea']!.imageSmall).toBe('https://cards.scryfall.io/small/front/leb-usea.jpg');
    expect(overrides['oid-usea']!.artCrop).toBe('https://cards.scryfall.io/art_crop/front/leb-usea.jpg');
    expect(overrides['oid-foil-only']!.priceUsd).toBe(42.5);
  });

  it('normalizes digital-represented cards with paper price & art while preserving oracle-cards id', () => {
    const rawTwister = makeCard({
      id: 'vma-uuid-preserved',
      oracle_id: 'oid-twister',
      name: 'Timetwister',
      mana_cost: '{2}{U}',
      cmc: 3,
      type_line: 'Sorcery',
      oracle_text: 'Each player shuffles their hand and graveyard into their library, then draws seven cards.',
      colors: ['U'],
      color_identity: ['U'],
      games: ['mtgo'],
      digital: true,
      prices: { usd: null },
      image_uris: {
        small: 'https://cards.scryfall.io/small/front/vma-twister.jpg',
        normal: 'https://cards.scryfall.io/normal/front/vma-twister.jpg',
        art_crop: 'https://cards.scryfall.io/art_crop/front/vma-twister.jpg',
      },
    });

    const compact = normalizeCard(rawTwister, {
      priceUsd: 4250.0,
      imageNormal: 'https://cards.scryfall.io/normal/front/2ed-twister.jpg',
      imageSmall: 'https://cards.scryfall.io/small/front/2ed-twister.jpg',
      artCrop: 'https://cards.scryfall.io/art_crop/front/2ed-twister.jpg',
    });

    expect(compact).not.toBeNull();
    // Critical invariant: CompactCard.id must stay identical to oracle-cards raw.id
    expect(compact!.id).toBe('vma-uuid-preserved');
    expect(compact!.priceUsd).toBe(4250.0);
    expect(compact!.imageNormal).toBe('https://cards.scryfall.io/normal/front/2ed-twister.jpg');
    expect(compact!.imageSmall).toBe('https://cards.scryfall.io/small/front/2ed-twister.jpg');

    // Already-paper card with null price keeps original artwork and only fills priceUsd
    const rawSummerSacrifice = makeCard({
      id: 'sum-sac-uuid',
      oracle_id: 'oid-sac',
      name: 'Sacrifice',
      games: ['paper'],
      digital: false,
      prices: { usd: null },
      image_uris: {
        small: 'https://cards.scryfall.io/small/front/sum-sac.jpg',
        normal: 'https://cards.scryfall.io/normal/front/sum-sac.jpg',
      },
    });

    const fixedPaperOnly = normalizeCard(rawSummerSacrifice, {
      priceUsd: 2.15,
      imageNormal: 'https://cards.scryfall.io/normal/front/3ed-sac.jpg',
      imageSmall: 'https://cards.scryfall.io/small/front/3ed-sac.jpg',
    });

    expect(fixedPaperOnly!.id).toBe('sum-sac-uuid');
    expect(fixedPaperOnly!.priceUsd).toBe(2.15);
    expect(fixedPaperOnly!.imageNormal).toBe('https://cards.scryfall.io/normal/front/sum-sac.jpg');
  });

  it('reuses cached paper-overrides.json and degrades gracefully in offline mode without cache', async () => {
    const tempCache = mkdtempSync(path.join(tmpdir(), 'mtg-paper-cache-'));
    try {
      const rawCards = [
        makeCard({ oracle_id: 'oid-1', name: 'Mox Diamond', games: ['mtgo'], digital: true, prices: { usd: null } }),
      ];

      // 1. Offline without cache warns and returns empty overrides without throwing
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const missingRes = await resolvePaperOverrides({
        rawCards,
        oracleUpdatedAt: '2026-11-14T00:00:00Z',
        cacheDir: tempCache,
        offline: true,
      });
      expect(missingRes.resolvedCount).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();

      // 2. When valid cache exists, resolvePaperOverrides uses it without hitting the network
      writeFileSync(
        path.join(tempCache, 'paper-overrides.json'),
        JSON.stringify({
          version: 1,
          updatedAt: '2026-11-14T00:00:00Z',
          targetCount: 1,
          overrides: {
            'oid-1': {
              priceUsd: 685.0,
              imageNormal: 'https://cards.scryfall.io/normal/front/sth-mox-diamond.jpg',
            },
          },
        }),
        'utf8',
      );

      const cachedRes = await resolvePaperOverrides({
        rawCards,
        oracleUpdatedAt: '2026-11-14T00:00:00Z',
        cacheDir: tempCache,
        offline: false,
      });
      expect(cachedRes.fromCache).toBe(true);
      expect(cachedRes.pricedCount).toBe(1);
      expect(cachedRes.overrides['oid-1']!.priceUsd).toBe(685.0);
    } finally {
      rmSync(tempCache, { recursive: true, force: true });
    }
  });
});
