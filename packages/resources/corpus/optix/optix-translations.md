---
id: optix-translations
title: Text is a key, and the session picks the language
domain: optix
level: practitioner
basis: [creating-projects/translations/Translations.html, creating-projects/translations/Translate-a-string.html, creating-projects/translations/Change-the-interface-language.html, creating-projects/translations/language-displayed-at-runtime.html, creating-projects/translations/Localization-editor.html, creating-projects/translations/Add-a-locale-language-to-a-localization-dictionary.html, creating-projects/translations/Use-translated-texts-in-a-string-formatter.html, creating-projects/sessions/translation-scope-for-localized-text.html, creating-projects/sessions/Configure-session-and-fallback-locales.html, creating-projects/sessions/Configure-the-locale-at-runtime.html, creating-projects/sessions/Locales.html, Reference/FTOptix-UI/ObjectTypes/UISession.html]
tags: [translations, localization, locale, text, i18n]
applies_to: [optix]
rules: [OPTIX-I18N-01, OPTIX-I18N-02]
---
## Principle
Translation in Optix is not a pass over the project at the end. A localization dictionary holds keys and one
column per configured locale, and text is translated only when the string on the object is a key that the
dictionary contains — a literal typed into a Label, a button caption or an alarm message is displayed exactly
as typed, in every language. That asymmetry is the whole failure mode: the screen an engineer built reads
correctly in English, the dictionary looks complete, and the operator who logs on in Italian sees a mixture of
Italian chrome and English captions.

Scope matters as much as content. Translation happens inside a locale-aware UI session; objects outside it
use the root session locale. Alarms, event loggers and reports are the documented exception that still
localize through the dictionary. An alarm message therefore has to be a dictionary entry or a localized text,
not a sentence assembled in a NetLogic from translated fragments — word order differs, and a concatenation
that reads well in one language reads wrong in the next.

The language itself is a session value, not an application setting. The presentation engine manages it per
connected user, the session's default is the user's locale, and it can be changed at runtime without
reconnecting. Locale IDs are language plus country, and the country segment also decides the date and time
format, the data separator and the measurement system, which is why a Portuguese operator and a Brazilian
operator are two locales rather than one language.

## Rules
- **OPTIX-I18N-01** Every operator-visible string — Label `Text`, button caption, TextBox `PlaceholderText`,
  alarm `Message`, dialog title, window caption — is a `LocalizedText` whose value is a key present in the
  localization dictionary with an entry for every configured locale; a literal string left on any of those
  properties is a defect, because literal strings are not translated automatically.
- **OPTIX-I18N-02** The project declares its supported `Locales` and its `Translation fallback locales` at the
  project node, the runtime language is the session's (the user's locale by default, switchable by binding
  `ActualLanguage`), and any sentence that mixes text with values is a translated String formatter `Format`
  rather than concatenated translated pieces; a project with one locale configured, or with a translated
  fragment concatenated to a value, is a defect.

## Apply
Inventory the strings before translating. `optix_read` `{action:"map", path:"Translations"}` lists the
dictionaries and `{action:"node"}` on one shows the locales it carries; on the screen side, `{action:"node"}`
on a Label or button returns its `Text` value, which is the evidence for whether the value is a key or a
literal. `{action:"type_schema", type:"Label"}` confirms that `Text` is a `LocalizedText` in this build.

Create the dictionary and its keys. Keep the template project's dictionary under `Translations` and add
locales to it with `optix_edit` `set_property` on the dictionary's locale collection, or create a second
dictionary when a namespace of strings (alarms versus screens) deserves its own table. Keys are created from
the string's translation reference, so a new caption gets a key through the Localization editor and the key is
then reused by every object that shows it; `optix_edit` `set_property` with `locale` writes the per-locale
entry on the object or on the dictionary node.

Point objects at keys. `optix_edit` `{"op":"set_property","path":"<label>","name":"Text","value":"<key>"}`
replaces the literal with the key; the same op with `locale` covers the localized variants. For a caption that
must not translate — a unit symbol, an equipment tag, a part number — the value stays a literal on purpose, and
the page records it as an exception rather than letting the audit flag it. `optix_design_check` reports the
hardcoded strings it can see, and the finding list plus the recorded exceptions is the translation review.

Sentences with values. Where text and numbers share a line, use a String formatter converter whose `Format` is
the translated sentence containing the placeholder, and translate the whole `Format` string as one dictionary
entry (for example a `Value: {0}` template and its per-locale forms). `optix_edit` `attach_string_formatter`
stages it, `optix_validate_expression` checks the composed output, and the formatter's `Mode` is Read/Write
only when the operator must also type a value back.

Switch language at runtime. Set the project's `Locales` list and `Translation fallback locales`, and create or
reuse a UI Session object as the presentation engine's `Session`; the runtime switch is a Combo box or a
`LocaleComboBox` bound to the session's `ActualLanguage`, staged with `optix_edit` `bind` at
`{Session}/ActualLanguage` (or the aliased session path inside a widget). Verify by logging in as a user whose
`Locale` differs and capturing the same screen with `optix_screenshot` under each locale — the acceptance
evidence is the screen in every configured language, not a screenshot of the dictionary.
