/**
 * Validators for Malaysian identifiers. Each takes digits already taken
 * from the FOLDED match (ASCII) and cites its source.
 */

/**
 * Place-of-birth (PB) codes, digits 7–8 of a MyKad number, as the National
 * Registration Department (Jabatan Pendaftaran Negara, JPN) publishes them,
 * retrieved 2026-11-26:
 *
 *   - states and federal territories ("Kod Negeri"):
 *     https://www.jpn.gov.my/my/kod-negeri
 *   - born outside Malaysia ("Kod Negara"):
 *     https://www.jpn.gov.my/my/kod-negara
 *
 * 86 of the 100 two-digit codes are listed. Not listed, so not in this set:
 * 00, 17–20, 69, 70, 73, 80, 81 and 94–97. The recognizer still masks a
 * number with an unlisted code (see `nric`): the list is an administrative
 * table that has grown before — Putrajaya (16) became a federal territory
 * in 2001, after 12-digit numbers were already being issued — and a stale
 * copy must not let a newly issued number through.
 */
const STATE_CODES: Readonly<Record<string, string>> = {
  Johor: "01 21 22 23 24",
  Kedah: "02 25 26 27",
  Kelantan: "03 28 29",
  Melaka: "04 30",
  "Negeri Sembilan": "05 31 59",
  Pahang: "06 32 33",
  "Pulau Pinang": "07 34 35",
  Perak: "08 36 37 38 39",
  Perlis: "09 40",
  Selangor: "10 41 42 43 44",
  Terengganu: "11 45 46",
  Sabah: "12 47 48 49",
  Sarawak: "13 50 51 52 53",
  "WP Kuala Lumpur": "14 54 55 56 57",
  "WP Labuan": "15 58",
  "WP Putrajaya": "16",
  "Negeri Tidak Diketahui (state unknown)": "82",
};

/**
 * JPN "Kod Negara": 60 Brunei, 61 Indonesia, 62 Cambodia, 63 Laos,
 * 64 Myanmar, 65 Philippines, 66 Singapore, 67 Thailand, 68 Vietnam,
 * 71 and 72 abroad (luar negara), 74 China, 75 India, 76 Pakistan,
 * 77 Saudi Arabia, 78 Sri Lanka, 79 Bangladesh; 83–93 group the rest of
 * the world by region (83 Asia-Pacific and Oceania, 84 South America,
 * 85 Africa, 86 Europe, 87 Britain and Ireland, 88 Middle East, 89 Far
 * East, 90 Central America and the Caribbean, 91 North America, 92 Eastern
 * Europe, 93 other countries); 98 stateless; 99 refugees and unspecified.
 */
const COUNTRY_CODES = "60 61 62 63 64 65 66 67 68 71 72 74 75 76 77 78 79 83 84 85 86 87 88 89 90 91 92 93 98 99";

export const MYKAD_PB_CODES: ReadonlySet<string> = new Set(
  [...Object.values(STATE_CODES), COUNTRY_CODES].join(" ").split(" "),
);

const THIRTY_DAYS = new Set([4, 6, 9, 11]);

/**
 * Does YYMMDD name a real day in 19YY or 20YY? A MyKad number opens with
 * the holder's date of birth, without a century digit, so both centuries
 * are possible. ⚠️ JPN publishes the PB codes above but not the structure
 * of the number itself; YYMMDD-PB-###G is documented by secondary sources
 * (Microsoft Purview's "Malaysia identity card number" definition,
 * https://learn.microsoft.com/en-us/purview/sit-defn-malaysia-identification-card-number,
 * and the Wikipedia article on the Malaysian identity card).
 *
 * 29 February exists whenever YY is a multiple of 4: 1900 was not a leap
 * year but 2000 was, so `000229` is a date. The date is not compared with
 * today's — the same text must mask the same way next year (D1), and
 * over-masking an impossible future birth date is the safe direction.
 */
export function isMyKadDate(yymmdd: string): boolean {
  if (!/^\d{6}$/.test(yymmdd)) return false;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1) return false;
  const days = mm === 2 ? (yy % 4 === 0 ? 29 : 28) : THIRTY_DAYS.has(mm) ? 30 : 31;
  return dd <= days;
}
