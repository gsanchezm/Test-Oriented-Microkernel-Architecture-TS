# Catalog / Navbar / Pizza Builder / Profile — Feature Files Design

**Date:** 2026-05-22
**Domains:**
- `src/core/tests/catalog/`
- `src/core/tests/navbar/`
- `src/core/tests/pizzaBuilder/`
- `src/core/tests/profile/`

**Status:** Approved design, pending implementation plan

## 1. Problem statement

The four slices above are scaffolded as empty folders (`contracts/`, `dao/`, `molecules/`, `organisms/`, `resonance/`, `step_definitions/`, `features/`). Each one has a fully drafted `*.locators.json` contract, which signals intent — but `features/` is empty, so the surfaces they cover are untested.

This spec defines the Gherkin feature files only (happy paths). Step definitions, routes, organisms, molecules, and DAOs are out of scope for this spec and will be designed in the implementation plan.

## 2. Goal

Author one feature file per slice that follows the style of the existing references (`order-success.feature`, `invalid-credentials.feature`, `market-language-localization.feature`, `place-delivery-order.feature`):

- `Feature:` header + narrative paragraph + `As/I want/So that` block.
- `Background` when login is required.
- `Scenario Outline` + `Examples` table for parametric coverage.
- Standard tag taxonomy: `@desktop @responsive @android @ios @visual` always, plus `@api @performance @ui-only` when applicable.
- Third-person, present-tense step phrasing ("they open…", "they choose…").
- Standard i18n matrix: `US/en`, `MX/es`, `CH/de`, `CH/fr`, `JP/ja`.

## 3. Non-goals

- **Step definitions, routes, organisms, molecules** — designed in the implementation plan, not here.
- **Negative paths** — sad paths (network errors, validation failures, locked-out cases) deferred to a later iteration. This spec is happy-paths only.
- **Delete account** — destructive, hard to reverse between runs. Excluded.
- **Performance / resonance** — no Gatling simulations in this spec.
- **Pixel-perfect i18n validation** — translated strings asserted in Examples are best-effort literals that must be reconciled with the actual app i18n bundles before merging.

## 4. Decisions locked in brainstorming

| # | Question | Decision |
|---|---|---|
| 1 | i18n matrix breadth | 5 rows (US/MX/CH-de/CH-fr/JP) in every feature |
| 2 | Entry to pizza builder | Atomic (`Given the pizza builder is open for "<item>"`) — no UI chain from catalog |
| 3 | Profile save persistence | UI reload **and** `@api` variant with DAO read-back |
| 4 | Header language switcher in navbar | Own scenario in `navbar.feature` |
| 5 | Cart count assertion | Only in `pizzaBuilder.feature` (when `Confirm add to cart` is clicked) |
| 6 | Catalog → builder integration | Own scenario in `catalog.feature` ("Opening a pizza card launches the builder") |
| 7 | Delete account | Excluded from this round |

## 5. Constraints discovered during brainstorming

### 5.1 Header language switcher is CH-only

`navbar.locators.json` exposes only `languageDEButton` / `languageFRButton` (web + mobile + their `headerLanguage*` mobile-header siblings). There are no `lang-en`, `lang-es`, or `lang-ja` locators. This indicates the header language toggle is rendered only when the active market is `CH` (which has two official languages). For US, MX, JP the language is fixed by the market, set at login.

→ The header-switcher scenario uses a **CH-only 2-row matrix** (de→fr and fr→de). All other navbar scenarios use the standard 5-row matrix.

### 5.2 Pizza builder entry is atomic, not via catalog

Per decision #2, `pizza-builder.feature` does not click a catalog card to open the builder. Instead it uses a high-level Given:

```gherkin
Given the pizza builder is open for "<item>" in market "<market>" using language "<language>"
```

The catalog→builder integration is covered in the **catalog** feature (decision #6), so removing it from the builder feature avoids duplication and decouples the slices.

### 5.3 Profile DAO does not exist yet

`src/core/tests/profile/dao/` is empty. The `@api` profile scenario will require a `ProfileDao.getProfile(username)` accessor. This is a known follow-up for the implementation plan — the feature file authors the contract, the DAO lands in the next phase.

### 5.4 Translated strings are placeholders

Every literal in the `Examples` columns (e.g. `Hinzufügen`, `カートに追加`, `Ajouter`) is a best-guess based on the locators' semantic intent. Before the suite runs green, the literals must be reconciled against the app's actual i18n bundles. This is an explicit known-unknown — not a defect.

## 6. The feature files

### 6.1 `src/core/tests/catalog/features/browse-catalog.feature`

```gherkin
Feature: Browse the OmniPizza catalog across markets
  The OmniPizza catalog presents pizzas in a localized grid grouped by category.
  Users can search by name, filter by category, and tap a card to open the
  pizza builder. Section headers, category labels, and the "Add to cart" CTA
  are translated per market language.

    As an OmniPizza user,
    I want a browsable, searchable catalog in my market's language,
    So that I can quickly find a pizza and start customizing it.

  Background:
    Given the OmniPizza user is logged in as "standard_user"

  @desktop @responsive @android @ios @visual @ui-only
  Scenario Outline: Catalog renders in <market>/<language>
    Given they are browsing the catalog in market "<market>" using language "<language>"
    Then the catalog screen is fully displayed
    And the add-to-cart label "<addToCartLabel>" is visible on a pizza card

    Examples:
      | market | language | addToCartLabel |
      | US     | en       | Add to cart    |
      | MX     | es       | Agregar        |
      | CH     | de       | Hinzufügen     |
      | CH     | fr       | Ajouter        |
      | JP     | ja       | カートに追加    |

  @android @ios @visual @ui-only
  Scenario Outline: Catalog shows the localized section title in <market>/<language> (mobile only)
    Given they are browsing the catalog in market "<market>" using language "<language>"
    Then the section title "<sectionTitle>" is visible

    Examples:
      | market | language | sectionTitle |
      | US     | en       | Pizzas       |
      | MX     | es       | Pizzas       |
      | CH     | de       | Pizzen       |
      | CH     | fr       | Pizzas       |
      | JP     | ja       | ピザ         |

  @desktop @responsive @android @ios @visual
  Scenario Outline: Searching narrows the catalog by name in <market>
    Given they are browsing the catalog in market "<market>" using language "<language>"
    When they search the catalog for "<query>"
    Then only pizzas whose name contains "<query>" remain visible
    When they clear the catalog filters
    Then the full pizza grid is restored

    Examples:
      | market | language | query      |
      | US     | en       | Pepperoni  |
      | MX     | es       | Margherita |
      | CH     | de       | Marinara   |
      | CH     | fr       | Marinara   |
      | JP     | ja       | Pepperoni  |

  @desktop @responsive @android @ios @visual
  Scenario Outline: Filtering by category narrows the catalog in <market>
    Given they are browsing the catalog in market "<market>" using language "<language>"
    When they select the "<category>" category
    Then only pizzas in category "<category>" are visible

    Examples:
      | market | language | category   |
      | US     | en       | classic    |
      | MX     | es       | classic    |
      | CH     | de       | vegetarian |
      | CH     | fr       | vegetarian |
      | JP     | ja       | premium    |

  @desktop @responsive @android @ios @visual
  Scenario Outline: Opening a pizza card launches the builder in <market>
    Given they are browsing the catalog in market "<market>" using language "<language>"
    When they open the pizza "<item>"
    Then the pizza builder is displayed for "<item>"

    Examples:
      | market | language | item       |
      | US     | en       | Pepperoni  |
      | MX     | es       | Margherita |
      | CH     | de       | Marinara   |
      | CH     | fr       | Marinara   |
      | JP     | ja       | Pepperoni  |
```

**Notes**
- Category IDs (`classic`, `vegetarian`, `premium`) are nominal placeholders — adjust to the real category taxonomy of the app.
- `@ui-only` applies only to the render scenario (pure paint, no interaction); interaction scenarios (search, filter, open) drop it.

### 6.2 `src/core/tests/navbar/features/navbar-shell.feature`

```gherkin
Feature: Navbar shell — links, branding, and language switching per market
  The OmniPizza navbar provides persistent navigation across the authenticated
  app: logo, catalog / checkout / profile links, a responsive hamburger menu,
  and (on CH only) a header language switcher. The navbar must render
  consistently in every market the user is signed into.

    As an OmniPizza user,
    I want a consistent navbar that adapts to my market,
    So that I can move across the app without losing context.

  Background:
    Given the OmniPizza user is logged in as "standard_user"

  @desktop @visual @ui-only
  Scenario Outline: Desktop navbar links are present in <market>
    Given they are on the catalog screen in market "<market>" using language "<language>"
    Then the navbar logo, catalog, checkout, and profile links are visible

    Examples:
      | market | language |
      | US     | en       |
      | MX     | es       |
      | CH     | de       |
      | CH     | fr       |
      | JP     | ja       |

  @responsive @android @ios @visual @ui-only
  Scenario Outline: Mobile navbar exposes the same links via hamburger in <market>
    Given they are on the catalog screen in market "<market>" using language "<language>"
    When they open the mobile navigation menu
    Then the mobile menu shows catalog, checkout, profile, and logout entries

    Examples:
      | market | language |
      | US     | en       |
      | MX     | es       |
      | CH     | de       |
      | CH     | fr       |
      | JP     | ja       |

  @desktop @responsive @android @ios @visual
  Scenario Outline: Header language switcher updates the active locale in CH (<sourceLanguage> → <targetLanguage>)
    Given they are on the catalog screen in market "CH" using language "<sourceLanguage>"
    When they switch the header language to "<targetLanguage>"
    Then the catalog add-to-cart label reflects "<addToCartLabel>"

    Examples:
      | sourceLanguage | targetLanguage | addToCartLabel |
      | de             | fr             | Ajouter        |
      | fr             | de             | Hinzufügen     |
```

**Notes**
- First two scenarios stay on the standard 5-row matrix.
- Third scenario uses the CH-only 2-row matrix (see §5.1).
- `@ui-only` on the desktop / mobile-menu scenarios because they are pure render checks; the language-switcher scenario interacts and drops `@ui-only`.

### 6.3 `src/core/tests/pizzaBuilder/features/customize-pizza.feature`

```gherkin
Feature: Customize a pizza in the builder across markets
  The OmniPizza pizza builder lets the user pick a size and one or more
  toppings, watching the estimated total update in real time, then add the
  customized pizza to the cart. Section labels and price formatting are
  translated per market language.

    As an OmniPizza user,
    I want to customize a pizza and see the price update as I choose options,
    So that I know what I'm paying before adding it to the cart.

  Background:
    Given the OmniPizza user is logged in as "standard_user"

  @desktop @responsive @android @ios @visual @ui-only
  Scenario Outline: Builder renders for <item> in <market>/<language>
    Given the pizza builder is open for "<item>" in market "<market>" using language "<language>"
    Then the size options and topping options are rendered
    And the customizer price and confirm-add-to-cart affordance are visible

    Examples:
      | market | item       | language |
      | US     | Pepperoni  | en       |
      | MX     | Margherita | es       |
      | CH     | Marinara   | de       |
      | CH     | Marinara   | fr       |
      | JP     | Pepperoni  | ja       |

  @android @ios @visual @ui-only
  Scenario Outline: Builder section and total labels are translated in <market>/<language> (mobile only)
    Given the pizza builder is open for "<item>" in market "<market>" using language "<language>"
    Then the section labels "<sizeSection>" and "<toppingsSection>" are visible
    And the estimated total label "<totalLabel>" is visible

    Examples:
      | market | item       | language | sizeSection | toppingsSection | totalLabel       |
      | US     | Pepperoni  | en       | Size        | Toppings        | Estimated total  |
      | MX     | Margherita | es       | Tamaño      | Ingredientes    | Total estimado   |
      | CH     | Marinara   | de       | Grösse      | Beläge          | Geschätzt total  |
      | CH     | Marinara   | fr       | Taille      | Garnitures      | Total estimé     |
      | JP     | Pepperoni  | ja       | サイズ      | トッピング       | 概算合計          |

  @desktop @responsive @android @ios @visual
  Scenario Outline: Selecting a size updates the estimated total for <item> in <market>
    Given the pizza builder is open for "<item>" in market "<market>" using language "<language>"
    When they select size "<size>"
    Then the estimated total reflects the price of size "<size>"

    Examples:
      | market | item       | language | size   |
      | US     | Pepperoni  | en       | Large  |
      | MX     | Margherita | es       | Medium |
      | CH     | Marinara   | de       | Small  |
      | CH     | Marinara   | fr       | Small  |
      | JP     | Pepperoni  | ja       | Family |

  @desktop @responsive @android @ios @visual
  Scenario Outline: Selecting toppings updates the estimated total for <item> in <market>
    Given the pizza builder is open for "<item>" in market "<market>" using language "<language>"
    And they select size "<size>"
    When they add toppings "<toppings>"
    Then the estimated total reflects size "<size>" plus toppings "<toppings>"

    Examples:
      | market | item       | language | size   | toppings              |
      | US     | Pepperoni  | en       | Large  | extra-cheese          |
      | MX     | Margherita | es       | Medium | mushrooms,olives      |
      | CH     | Marinara   | de       | Small  | extra-cheese          |
      | CH     | Marinara   | fr       | Small  | mushrooms             |
      | JP     | Pepperoni  | ja       | Family | extra-cheese,jalapeño |

  @desktop @responsive @android @ios @visual
  Scenario Outline: Confirming add to cart closes the builder and increments the navbar cart count in <market>
    Given the pizza builder is open for "<item>" in market "<market>" using language "<language>"
    And they select size "<size>"
    And the navbar cart count is "<initialCount>"
    When they confirm add to cart
    Then the pizza builder is closed
    And the navbar cart count is "<expectedCount>"

    Examples:
      | market | item       | language | size   | initialCount | expectedCount |
      | US     | Pepperoni  | en       | Large  | 0            | 1             |
      | MX     | Margherita | es       | Medium | 0            | 1             |
      | CH     | Marinara   | de       | Small  | 0            | 1             |
      | CH     | Marinara   | fr       | Small  | 0            | 1             |
      | JP     | Pepperoni  | ja       | Family | 0            | 1             |
```

**Notes**
- Size labels (`Large`, `Medium`, `Small`, `Family`) come straight from `place-delivery-order.feature` — keep them consistent across slices.
- Topping IDs (`extra-cheese`, `mushrooms`, etc.) are nominal placeholders.
- Cart count assertions (decision #5) live exclusively here.

### 6.4 `src/core/tests/profile/features/update-profile.feature`

```gherkin
Feature: View and update the OmniPizza user profile across markets
  The OmniPizza profile screen shows the signed-in user's profile card
  (avatar, username, premium badge, meta) and lets them edit full name,
  phone, address, and order notes. After saving, the values persist
  across reloads. Form labels are translated per market language.

    As an OmniPizza user,
    I want to keep my delivery details accurate in my market's language,
    So that future orders go to the right place with the right contact info.

  Background:
    Given the OmniPizza user is logged in as "standard_user"

  @desktop @responsive @android @ios @visual @ui-only
  Scenario Outline: Profile renders for <user> in <market>/<language>
    Given they are on the profile screen in market "<market>" using language "<language>"
    Then the profile card shows username "<user>" and the premium badge is visible
    And the full name, phone, address, and notes inputs are visible

    Examples:
      | market | language | user           |
      | US     | en       | standard_user  |
      | MX     | es       | standard_user  |
      | CH     | de       | standard_user  |
      | CH     | fr       | standard_user  |
      | JP     | ja       | standard_user  |

  @android @ios @visual @ui-only
  Scenario Outline: Profile form labels are translated in <market>/<language> (mobile only)
    Given they are on the profile screen in market "<market>" using language "<language>"
    Then the form labels "<fullNameLabel>", "<phoneLabel>", "<addressLabel>", "<notesLabel>" are visible

    Examples:
      | market | language | fullNameLabel       | phoneLabel          | addressLabel | notesLabel |
      | US     | en       | Full name           | Phone number        | Address      | Notes      |
      | MX     | es       | Nombre              | Teléfono            | Dirección    | Notas      |
      | CH     | de       | Vollständiger Name  | Telefonnummer       | Adresse      | Notizen    |
      | CH     | fr       | Nom complet         | Numéro de téléphone | Adresse      | Notes      |
      | JP     | ja       | フルネーム          | 電話番号            | 住所         | メモ       |

  @desktop @responsive @android @ios @visual
  Scenario Outline: Updating profile fields persists after reload in <market>
    Given they are on the profile screen in market "<market>" using language "<language>"
    When they update the profile with full name "<fullName>", phone "<phone>", address "<address>", notes "<notes>"
    And they save the profile
    And they reload the profile screen
    Then the profile fields show full name "<fullName>", phone "<phone>", address "<address>", notes "<notes>"

    Examples:
      | market | language | fullName            | phone            | address           | notes                |
      | US     | en       | Julian Casablancas  | +1 415 555 0101  | 123 Luxury Avenue | Leave at the door    |
      | MX     | es       | Guillermo Alcantara | +52 55 1234 5678 | Av. Carranza 123  | Dejar en recepción   |
      | CH     | de       | Lukas Baumgartner   | +41 44 668 18 00 | Bahnhofstrasse 12 | An der Tür abgeben   |
      | CH     | fr       | Lukas Baumgartner   | +41 44 668 18 00 | Bahnhofstrasse 12 | Laisser à la porte   |
      | JP     | ja       | 田中 健太           | +81 3 1234 5678  | 1-2-3 Shibuya     | ドアに置いてください |

  @desktop @responsive @android @ios @api
  Scenario Outline: Updated profile is readable through the profile API in <market>
    Given they are on the profile screen in market "<market>" using language "<language>"
    When they update the profile with full name "<fullName>", phone "<phone>", address "<address>", notes "<notes>"
    And they save the profile
    Then the profile API reports full name "<fullName>", phone "<phone>", address "<address>", notes "<notes>"

    Examples:
      | market | language | fullName            | phone            | address           | notes                |
      | US     | en       | Phoebe Bridgers     | +1 415 555 0202  | 123 Luxury Avenue | Leave at the door    |
      | MX     | es       | Valentina Herrera   | +52 55 9876 5432 | Av. Carranza 123  | Dejar en recepción   |
      | CH     | de       | Anna Keller         | +41 44 668 19 00 | Bahnhofstrasse 12 | An der Tür abgeben   |
      | CH     | fr       | Anna Keller         | +41 44 668 19 00 | Bahnhofstrasse 12 | Laisser à la porte   |
      | JP     | ja       | 佐藤 明美           | +81 3 9876 5432  | 1-2-3 Shibuya     | ドアに置いてください |
```

**Notes**
- Names and phones reuse the same generation pool as `place-delivery-order.feature` for consistency.
- The third scenario (`@api`) requires `ProfileDao.getProfile(username)` — see §5.3.
- `@ui-only` applies only to the render scenario; update + reload + api variants drop it because they exercise persistence.

## 7. Tag taxonomy summary

| Tag | When | Notes |
|---|---|---|
| `@desktop` | Web at desktop viewport | Always present on web-able scenarios |
| `@responsive` | Web at mobile-responsive viewport | Always paired with `@desktop` for mobile-shaped web |
| `@android` | Mobile via Appium / Mobilewright | Add when scenario maps to mobile locators |
| `@ios` | Mobile via Appium / Mobilewright | Same as `@android` |
| `@visual` | Snapshot the rendered surface | The visual `After` hook fires on scenarios with this tag |
| `@ui-only` | Pure render — no interaction | Skips when `DRIVER=api` |
| `@api` | DAO / API-backed assertion | The `api` driver runs only these scenarios |
| `@performance` | Has a Gatling counterpart in `resonance/` | Not used in this spec |

## 8. Open items (carried into implementation plan)

1. Reconcile every translated literal in the `Examples` tables against the app's i18n bundle.
2. Resolve the real category taxonomy (`classic` / `vegetarian` / `premium` placeholders in catalog).
3. Resolve the real topping IDs (`extra-cheese`, `mushrooms`, `jalapeño` placeholders in builder).
4. Define `ProfileDao.getProfile(username)` shape for the `@api` profile scenario.
5. Decide on the visual snapshot ID scheme per feature (`catalog`, `navbar`, `pizza-builder`, `profile`) and any market/language bucketing per visual-paths.ts.
6. Confirm whether the `@responsive` and `@android`/`@ios` tags on `navbar.feature`'s mobile-menu scenario should exclude `@desktop` (currently it omits it — the menu does not exist at desktop viewport).
7. Navbar mobile-menu scenario maps to two different surfaces: web-responsive uses the hamburger (`mobileMenuButton` + `mobileNav*` locators, web-only), while `@android`/`@ios` use the bottom nav (`bottomNavContainer`, mobile-only). The route layer must dispatch correctly per `DRIVER` + `PLATFORM`; the spec keeps the user-facing intent ("see the same navigation entries") platform-agnostic.
8. Several text-label locators are mobile-only: `sectionHeader`/`sectionTitleText` (catalog), `sectionSizeText`/`sectionToppingsText`/`estimatedTotalLabel`/`builderTitleText` (pizza builder), and `fullNameLabel`/`phoneNumberLabel`/`addressLabel`/`notesLabel` (profile). The spec carves each into a mobile-only scenario alongside the cross-platform render scenario. If the web app gains `data-testid`s for these, fold the mobile-only scenarios back into the cross-platform ones.

## 9. Acceptance criteria for this spec

- Four feature files written, one per slice, each compiling under `cucumber-js` parser (no syntax errors).
- Every Scenario Outline references columns that exist in its Examples table.
- Tag taxonomy matches §7.
- All five markets covered where the matrix is full; CH-only where §5.1 applies.
- No negative paths, no destructive actions, no performance hooks.
