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
  Scenario Outline: Profile form labels are translated in <market>/<language>
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
