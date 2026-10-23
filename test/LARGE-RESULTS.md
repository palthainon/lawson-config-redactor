# Large Cisco example results

Date: 2026-10-23. Result: passed.

The fixture `fixtures/large-cisco.ios` contains 1,567 lines and 62,692 bytes. It combines synthetic command cases for 48 local networks with public uplinks. The input is for scanner tests. It is not a device configuration for deployment.

| Input category | Distinct values |
| --- | ---: |
| Private IPv4 addresses | 246 |
| Public IPv4 addresses | 8 |
| Private IPv6 addresses | 145 |
| Public IPv6 addresses | 145 |
| Seeded passwords and keys | 161 |

The full suite passed 110 automated tests. Tests in the isolated Visual Studio Code 1.102.0 editor also passed with this fixture.

- Both modes removed every seeded password and key from exported text.
- The new-address mode passed 151 network checks. Nested networks, host offsets, and repeated references remained consistent.
- Public addresses stayed public. Private addresses stayed private. No replacement reused an original address. Different source addresses had different replacements.
- Masks, prefix lengths, line count, and line endings remained unchanged.
- Each output address field matched its planned replacement.
- The topology checks passed with ten separate mapping keys.
- Clipboard output and saved output passed the same checks in the test editor. The clipboard was restored after the tests.
- The source text and the source file remained unchanged.

The normal installed editor also opened the fixture and its new-address comparison. The seeded credentials cover server authentication, local users, line passwords, routing authentication, key chains, shared keys, and management protocols.

These results cover the seeded values and supported command forms in this fixture. They do not establish detection of every Cisco secret. The tests do not check device command validity, address ownership, or address reachability.

Run `npm test` and `npm run test:host` from the repository root to repeat the checks. Run `node scripts/generate-large-fixture.js` to regenerate the input and its expected values. No replacement mappings are saved.
