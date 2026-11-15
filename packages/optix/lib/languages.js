/**
 * The design languages an Optix screen can be built in, as data.
 *
 * A language is a set of tokens that project onto an Optix `StyleSheet` and a set of named styles
 * that project onto the style collections the sheet carries. Nothing here draws: `theme.js` turns a
 * language into operations, `layout.js`/`kit.js` consult its measurements, and `design.js` grades a
 * screen against its `rubric` profile.
 *
 * `modern` is the default because a generated application that looks like 2012 is not a starting
 * point anyone should ship. The other languages exist because a plant may be bound by a standard
 * (ISA-101 muted surfaces, colour only for abnormal state) or by a device (a kiosk at 1.5× type).
 * Every value here is either measured from a Rockwell project (`FriendlyLight`, `MaterialDark` and
 * `SpaceShip` style sheets in `FeatureDemo2`) or is a documented Optix `StyleSheet` property.
 * @module dsh-tool-ft-optix/languages
 */

/**
 * @typedef {object} LanguageTokens
 * @property {string} [AccentColor]
 * @property {string} [AccentTextColor]
 * @property {string} [AccentBorderColor]
 * @property {string} [WindowColor]
 * @property {string} [ScreenColor]
 * @property {string} [TextColor]
 * @property {string} [BorderColor]
 * @property {string} [InteractiveColor]
 * @property {string} [InteractiveBackgroundColor]
 * @property {string} [DataInputBackgroundColor]
 * @property {string} [DataInputTextColor]
 * @property {string} [FocusColor]
 * @property {string} [DisabledOpacity]
 * @property {number} [Radius]
 * @property {number} [BorderWidth]
 * @property {number} [HorizontalPaddingPercent]
 * @property {number} [VerticalPaddingPercent]
 * @property {number} [InteractiveDropShadowSize]
 * @property {number} [FocusGlowSize]
 * @property {number} [FontPixelSize]
 * @property {string} [FontFamily]
 */

/**
 * A named style: which collection holds it, which style type it is, and the properties it sets.
 * @typedef {object} StyleSpec
 * @property {string} collection - Collection under the sheet, e.g. `ButtonStyles`.
 * @property {string} type - Style type name from the installed catalog, e.g. `ButtonStyle`.
 * @property {string} name - Style name the screen references, e.g. `Primary`.
 * @property {Record<string, string>} properties - Property name to string value.
 */

/**
 * How a screen designed in this language is graded.
 * @typedef {object} RubricProfile
 * @property {boolean} colourForStateOnly - True when colour must not decorate normal state.
 * @property {number} minDensity - Lowest acceptable share of filled area.
 * @property {number} maxDensity - Highest acceptable share of filled area.
 * @property {number} minTarget - Smallest acceptable touch target, in pixels.
 * @property {number} minFontSize - Smallest acceptable font size, in pixels.
 * @property {number} maxFontSizes - Most distinct font sizes a screen may use.
 * @property {boolean} shadowAllowed
 * @property {boolean} gradientAllowed
 * @property {number} maxAccentShare - Largest share of the screen the accent colour may cover.
 */

/**
 * @typedef {object} Language
 * @property {string} name
 * @property {string} title
 * @property {string} description
 * @property {string} basis - Where the values come from, so an engineer can check them.
 * @property {boolean} dark
 * @property {LanguageTokens} tokens
 * @property {StyleSpec[]} styles
 * @property {RubricProfile} rubric
 */

/** A colour Optix accepts: `#rrggbb`, `#aarrggbb`, or a bare hex string. */
const COLOUR = /^#[0-9a-f]{6,8}$/iu;
/** A size token, written the way Studio writes sizes. */
const SIZE = /^\d+(?:\.\d+)?$/u;

/**
 * The properties each named style type actually exposes, read from the running Studio's own type
 * definition (`GET /bridge/types/schema?type=<Style>`).
 *
 * Kept beside the languages so a hand-added style property fails validation here instead of failing a
 * whole authoring batch at the bridge. `ButtonStyle` is the one that bites: the installed Help documents
 * a `FocusBorderColor` that the 1.8.1 runtime refuses, so the measured set is the one used.
 */
export const STYLE_PROPERTIES = Object.freeze({
	ButtonStyles: Object.freeze(["BorderColor", "BorderWidth", "Color", "FontFamily", "FontItalic", "FontSize", "FontWeight", "HorizontalPaddingPercent", "IconUsesTextColor", "PressedBorderColor", "PressedColor", "PressedTextColor", "Radius", "SpacingPercent", "TextColor", "VerticalPaddingPercent"]),
	LabelStyles: Object.freeze(["BackgroundColor", "FontFamily", "FontItalic", "FontSize", "FontUnderline", "FontWeight", "Radius", "TextColor"]),
	ScreenStyles: Object.freeze(["BackgroundColor", "BorderColor", "BorderThickness"]),
	NavigationPanelStyles: Object.freeze(["ActiveColor", "ActivePrimaryColor", "ActiveSecondaryColor", "ActiveTextColor", "BackgroundColor", "FontFamily", "FontItalic", "FontSize", "FontWeight", "IconUsesTextColor", "InactiveColor", "InactiveTextColor", "Radius", "TabPadding", "TabSpacing"]),
	ChartStyles: Object.freeze(["AxisColor", "BackgroundColor", "FontFamily", "FontItalic", "FontSize", "FontWeight", "GridColor", "TextColor"]),
});

/**
 * The languages, in the order `optix_ui languages` lists them.
 * @type {Record<string, Language>}
 */
export const LANGUAGES = Object.freeze({
	modern: {
		name: "modern",
		title: "Modern industrial",
		description:
			"Light surfaces, a deep header band, one accent for interaction and state. The default for a new application.",
		basis:
			"Surfaces and accent follow the shipped FriendlyLight sheet; the header band and radii are the ones the generated shell has used since 0.97.0.",
		dark: false,
		tokens: {
			AccentColor: "#0FAFFF",
			AccentTextColor: "#FFFFFF",
			AccentBorderColor: "#0FAFFF",
			WindowColor: "#F2F4F7",
			ScreenColor: "#F2F4F7",
			TextColor: "#1B2A36",
			BorderColor: "#C9D2DA",
			InteractiveColor: "#0B3E5C",
			InteractiveBackgroundColor: "#FFFFFF",
			DataInputBackgroundColor: "#FFFFFF",
			DataInputTextColor: "#1B2A36",
			FocusColor: "#0FAFFF",
			DisabledOpacity: 45,
			Radius: 8,
			BorderWidth: 1,
			HorizontalPaddingPercent: 8,
			VerticalPaddingPercent: 8,
			InteractiveDropShadowSize: 4,
			FocusGlowSize: 2,
			FontPixelSize: 14,
		},
		styles: [
			{
				collection: "ButtonStyles",
				type: "ButtonStyle",
				name: "Primary",
				properties: {
					Color: "#0B3E5C",
					TextColor: "#FFFFFF",
					BorderColor: "#0B3E5C",
					PressedColor: "#082B40",
					PressedBorderColor: "#082B40",
					PressedTextColor: "#FFFFFF",
					Radius: "8.0",
					BorderWidth: "0.0",
				},
			},
			{
				collection: "ButtonStyles",
				type: "ButtonStyle",
				name: "Secondary",
				properties: {
					Color: "#FFFFFF",
					TextColor: "#1B2A36",
					BorderColor: "#C9D2DA",
					PressedColor: "#E7ECF1",
					PressedBorderColor: "#C9D2DA",
					PressedTextColor: "#1B2A36",
					Radius: "8.0",
					BorderWidth: "1.0",
				},
			},
			{
				collection: "ButtonStyles",
				type: "ButtonStyle",
				name: "Danger",
				properties: {
					Color: "#B42318",
					TextColor: "#FFFFFF",
					BorderColor: "#B42318",
					PressedColor: "#8C1B12",
					PressedBorderColor: "#8C1B12",
					PressedTextColor: "#FFFFFF",
					Radius: "8.0",
					BorderWidth: "0.0",
				},
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Title",
				properties: { TextColor: "#1B2A36", FontSize: "22.0", BackgroundColor: "#F2F4F7", Radius: "0.0" },
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Body",
				properties: { TextColor: "#1B2A36", FontSize: "14.0" },
			},
			{
				collection: "ScreenStyles",
				type: "ScreenStyle",
				name: "Default",
				properties: { BackgroundColor: "#F2F4F7", BorderColor: "#C9D2DA", BorderThickness: "0.0" },
			},
			{
				collection: "NavigationPanelStyles",
				type: "NavigationPanelStyle",
				name: "Default",
				properties: {
					BackgroundColor: "#FFFFFF",
					InactiveColor: "#FFFFFF",
					InactiveTextColor: "#5A6B7A",
					ActivePrimaryColor: "#0FAFFF",
					ActiveSecondaryColor: "#E7ECF1",
					Radius: "0.0",
					TabSpacing: "0.0",
					TabPadding: "8.0",
					FontSize: "14.0",
				},
			},
			{
				collection: "ChartStyles",
				type: "ChartStyle",
				name: "Default",
				properties: {
					BackgroundColor: "#FFFFFF",
					TextColor: "#3B4A57",
					GridColor: "#E1E7EC",
					AxisColor: "#C9D2DA",
					FontSize: "12.0",
				},
			},
		],
		rubric: {
			colourForStateOnly: false,
			minDensity: 45,
			maxDensity: 80,
			minTarget: 44,
			minFontSize: 12,
			maxFontSizes: 4,
			shadowAllowed: true,
			gradientAllowed: false,
			maxAccentShare: 20,
		},
	},
	"modern-dark": {
		name: "modern-dark",
		title: "Modern dark",
		description: "The same anatomy on near-black surfaces, for a control room that runs dim." ,
		basis: "MaterialDark measured in FeatureDemo2's StyleSheets chapter, plus the modern layout measurements.",
		dark: true,
		tokens: {
			AccentColor: "#00BCD4",
			AccentTextColor: "#FFFFFF",
			AccentBorderColor: "#00BCD4",
			WindowColor: "#121212",
			ScreenColor: "#121212",
			TextColor: "#E4E4E4",
			BorderColor: "#3A3A3A",
			InteractiveColor: "#242424",
			InteractiveBackgroundColor: "#303030",
			DataInputBackgroundColor: "#1C1C1C",
			DataInputTextColor: "#EBEBEB",
			FocusColor: "#00BCD4",
			DisabledOpacity: 45,
			Radius: 8,
			BorderWidth: 1,
			HorizontalPaddingPercent: 8,
			VerticalPaddingPercent: 8,
			InteractiveDropShadowSize: 4,
			FocusGlowSize: 2,
			FontPixelSize: 14,
		},
		styles: [
			{
				collection: "ButtonStyles",
				type: "ButtonStyle",
				name: "Primary",
				properties: {
					Color: "#00BCD4",
					TextColor: "#121212",
					BorderColor: "#00BCD4",
					PressedColor: "#0097A7",
					PressedTextColor: "#FFFFFF",
					Radius: "8.0",
					BorderWidth: "0.0",
				},
			},
			{
				collection: "ButtonStyles",
				type: "ButtonStyle",
				name: "Secondary",
				properties: {
					Color: "#303030",
					TextColor: "#E4E4E4",
					BorderColor: "#3A3A3A",
					PressedColor: "#242424",
					PressedTextColor: "#E4E4E4",
					Radius: "8.0",
					BorderWidth: "1.0",
				},
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Title",
				properties: { TextColor: "#FFFFFF", FontSize: "22.0" },
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Body",
				properties: { TextColor: "#E4E4E4", FontSize: "14.0" },
			},
			{
				collection: "ScreenStyles",
				type: "ScreenStyle",
				name: "Default",
				properties: { BackgroundColor: "#121212", BorderColor: "#3A3A3A", BorderThickness: "0.0" },
			},
			{
				collection: "ChartStyles",
				type: "ChartStyle",
				name: "Default",
				properties: {
					BackgroundColor: "#1C1C1C",
					TextColor: "#E4E4E4",
					GridColor: "#2A2A2A",
					AxisColor: "#3A3A3A",
					FontSize: "12.0",
				},
			},
		],
		rubric: {
			colourForStateOnly: false,
			minDensity: 40,
			maxDensity: 75,
			minTarget: 44,
			minFontSize: 12,
			maxFontSizes: 4,
			shadowAllowed: true,
			gradientAllowed: false,
			maxAccentShare: 20,
		},
	},
	isa101: {
		name: "isa101",
		title: "ISA-101 high performance HMI",
		description:
			"Muted surfaces, no shadows or gradients, colour only where abnormal state needs it. The layout stays dense but calm.",
		basis:
			"ISA-101 (2015) as summarised by the corpus page hmi-isa101; sizes and the target floor follow the HMI design rules the plugin already enforces.",
		dark: false,
		tokens: {
			AccentColor: "#3B6E8F",
			AccentTextColor: "#FFFFFF",
			AccentBorderColor: "#3B6E8F",
			WindowColor: "#C9CDD1",
			ScreenColor: "#E6E8EA",
			TextColor: "#1F2A33",
			BorderColor: "#A5ACB2",
			InteractiveColor: "#B7BDC2",
			InteractiveBackgroundColor: "#DDE1E4",
			DataInputBackgroundColor: "#F4F5F6",
			DataInputTextColor: "#1F2A33",
			FocusColor: "#1F2A33",
			DisabledOpacity: 40,
			Radius: 0,
			BorderWidth: 1,
			HorizontalPaddingPercent: 8,
			VerticalPaddingPercent: 8,
			InteractiveDropShadowSize: 0,
			FocusGlowSize: 0,
			FontPixelSize: 14,
		},
		styles: [
			{
				collection: "ButtonStyles",
				type: "ButtonStyle",
				name: "Primary",
				properties: {
					Color: "#DDE1E4",
					TextColor: "#1F2A33",
					BorderColor: "#A5ACB2",
					PressedColor: "#B7BDC2",
					PressedTextColor: "#1F2A33",
					Radius: "0.0",
					BorderWidth: "1.0",
				},
			},
			{
				collection: "ButtonStyles",
				type: "ButtonStyle",
				name: "Secondary",
				properties: {
					Color: "#E6E8EA",
					TextColor: "#1F2A33",
					BorderColor: "#A5ACB2",
					PressedColor: "#C9CDD1",
					PressedTextColor: "#1F2A33",
					Radius: "0.0",
					BorderWidth: "1.0",
				},
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Title",
				properties: { TextColor: "#1F2A33", FontSize: "20.0" },
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Body",
				properties: { TextColor: "#1F2A33", FontSize: "14.0" },
			},
			{
				collection: "ScreenStyles",
				type: "ScreenStyle",
				name: "Default",
				properties: { BackgroundColor: "#E6E8EA", BorderColor: "#A5ACB2", BorderThickness: "0.0" },
			},
			{
				collection: "NavigationPanelStyles",
				type: "NavigationPanelStyle",
				name: "Default",
				properties: {
					BackgroundColor: "#C9CDD1",
					InactiveColor: "#C9CDD1",
					InactiveTextColor: "#3B4650",
					ActivePrimaryColor: "#3B6E8F",
					ActiveSecondaryColor: "#E6E8EA",
					Radius: "0.0",
					TabSpacing: "0.0",
					TabPadding: "8.0",
					FontSize: "14.0",
				},
			},
			{
				collection: "ChartStyles",
				type: "ChartStyle",
				name: "Default",
				properties: {
					BackgroundColor: "#E6E8EA",
					TextColor: "#1F2A33",
					GridColor: "#B7BDC2",
					AxisColor: "#A5ACB2",
					FontSize: "12.0",
				},
			},
		],
		rubric: {
			colourForStateOnly: true,
			minDensity: 30,
			maxDensity: 70,
			minTarget: 44,
			minFontSize: 12,
			maxFontSizes: 3,
			shadowAllowed: false,
			gradientAllowed: false,
			maxAccentShare: 8,
		},
	},
	"isa101-hc": {
		name: "isa101-hc",
		title: "ISA-101 high contrast",
		description:
			"ISA-101 with 7:1 text contrast and larger targets, for a panel in daylight or an operator who needs it.",
		basis: "ISA-101 with the contrast floor the plugin's HMI-CONTRAST-01 check enforces, raised to 7:1.",
		dark: false,
		tokens: {
			AccentColor: "#0B3E5C",
			AccentTextColor: "#FFFFFF",
			AccentBorderColor: "#0B3E5C",
			WindowColor: "#E6E8EA",
			ScreenColor: "#FFFFFF",
			TextColor: "#0B0F12",
			BorderColor: "#5A6268",
			InteractiveColor: "#0B3E5C",
			InteractiveBackgroundColor: "#FFFFFF",
			DataInputBackgroundColor: "#FFFFFF",
			DataInputTextColor: "#0B0F12",
			FocusColor: "#0B3E5C",
			DisabledOpacity: 50,
			Radius: 0,
			BorderWidth: 2,
			HorizontalPaddingPercent: 10,
			VerticalPaddingPercent: 10,
			InteractiveDropShadowSize: 0,
			FocusGlowSize: 0,
			FontPixelSize: 16,
		},
		styles: [
			{
				collection: "ButtonStyles",
				type: "ButtonStyle",
				name: "Primary",
				properties: {
					Color: "#0B3E5C",
					TextColor: "#FFFFFF",
					BorderColor: "#0B0F12",
					PressedColor: "#06283C",
					PressedTextColor: "#FFFFFF",
					Radius: "0.0",
					BorderWidth: "2.0",
				},
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Title",
				properties: { TextColor: "#0B0F12", FontSize: "24.0" },
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Body",
				properties: { TextColor: "#0B0F12", FontSize: "16.0" },
			},
			{
				collection: "ScreenStyles",
				type: "ScreenStyle",
				name: "Default",
				properties: { BackgroundColor: "#FFFFFF", BorderColor: "#5A6268", BorderThickness: "0.0" },
			},
		],
		rubric: {
			colourForStateOnly: true,
			minDensity: 30,
			maxDensity: 65,
			minTarget: 56,
			minFontSize: 16,
			maxFontSizes: 3,
			shadowAllowed: false,
			gradientAllowed: false,
			maxAccentShare: 8,
		},
	},
	"material-dark": {
		name: "material-dark",
		title: "Material dark",
		description: "The shipped MaterialDark sheet as a language, when an application already matches it.",
		basis: "The MaterialDark style sheet Studio ships, measured property by property in FeatureDemo2.",
		dark: true,
		tokens: {
			AccentColor: "#00BCD4",
			AccentTextColor: "#FFFFFF",
			WindowColor: "#121212",
			ScreenColor: "#121212",
			TextColor: "#E4E4E4",
			BorderColor: "#B3B3B3",
			InteractiveColor: "#242424",
			InteractiveBackgroundColor: "#303030",
			DataInputBackgroundColor: "#1C1C1C",
			DataInputTextColor: "#EBEBEB",
			FocusColor: "#00BCD4",
			Radius: 4,
			BorderWidth: 1,
			FontPixelSize: 16,
		},
		styles: [
			{
				collection: "ButtonStyles",
				type: "ButtonStyle",
				name: "Primary",
				properties: {
					Color: "#00BCD4",
					TextColor: "#121212",
					BorderColor: "#00BCD4",
					Radius: "4.0",
					BorderWidth: "0.0",
				},
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Title",
				properties: { TextColor: "#FFFFFF", FontSize: "22.0" },
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Body",
				properties: { TextColor: "#E4E4E4", FontSize: "16.0" },
			},
		],
		rubric: {
			colourForStateOnly: false,
			minDensity: 40,
			maxDensity: 75,
			minTarget: 44,
			minFontSize: 12,
			maxFontSizes: 4,
			shadowAllowed: true,
			gradientAllowed: false,
			maxAccentShare: 20,
		},
	},
	"minimal-light": {
		name: "minimal-light",
		title: "Minimal light",
		description: "White on white with hairlines, for a reporting or dashboard screen rather than a machine panel.",
		basis: "A restrained projection of the modern tokens: no fills beyond white, one hairline, one accent.",
		dark: false,
		tokens: {
			AccentColor: "#2563EB",
			AccentTextColor: "#FFFFFF",
			WindowColor: "#FFFFFF",
			ScreenColor: "#FBFCFD",
			TextColor: "#111827",
			BorderColor: "#E5E7EB",
			InteractiveColor: "#2563EB",
			InteractiveBackgroundColor: "#FFFFFF",
			DataInputBackgroundColor: "#FFFFFF",
			DataInputTextColor: "#111827",
			FocusColor: "#2563EB",
			Radius: 6,
			BorderWidth: 1,
			FontPixelSize: 14,
		},
		styles: [
			{
				collection: "ButtonStyles",
				type: "ButtonStyle",
				name: "Primary",
				properties: {
					Color: "#2563EB",
					TextColor: "#FFFFFF",
					BorderColor: "#2563EB",
					Radius: "6.0",
					BorderWidth: "0.0",
				},
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Title",
				properties: { TextColor: "#111827", FontSize: "20.0" },
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Body",
				properties: { TextColor: "#111827", FontSize: "14.0" },
			},
			{
				collection: "ScreenStyles",
				type: "ScreenStyle",
				name: "Default",
				properties: { BackgroundColor: "#FBFCFD", BorderColor: "#E5E7EB", BorderThickness: "0.0" },
			},
		],
		rubric: {
			colourForStateOnly: false,
			minDensity: 35,
			maxDensity: 70,
			minTarget: 44,
			minFontSize: 12,
			maxFontSizes: 4,
			shadowAllowed: false,
			gradientAllowed: false,
			maxAccentShare: 12,
		},
	},
	kiosk: {
		name: "kiosk",
		title: "Kiosk",
		description: "Modern, scaled 1.5× with fewer, larger controls for a wall-mounted or gloved-hand terminal.",
		basis: "The modern language with every measurement scaled for a 1.5× viewing distance.",
		dark: false,
		tokens: {
			AccentColor: "#0FAFFF",
			AccentTextColor: "#FFFFFF",
			WindowColor: "#0B1521",
			ScreenColor: "#0F1B29",
			TextColor: "#F5F8FA",
			BorderColor: "#2C4A63",
			InteractiveColor: "#0B3E5C",
			InteractiveBackgroundColor: "#13283B",
			DataInputBackgroundColor: "#0F1B29",
			DataInputTextColor: "#F5F8FA",
			FocusColor: "#0FAFFF",
			Radius: 12,
			BorderWidth: 2,
			HorizontalPaddingPercent: 10,
			VerticalPaddingPercent: 10,
			FontPixelSize: 22,
		},
		styles: [
			{
				collection: "ButtonStyles",
				type: "ButtonStyle",
				name: "Primary",
				properties: {
					Color: "#0FAFFF",
					TextColor: "#0B1521",
					BorderColor: "#0FAFFF",
					Radius: "12.0",
					BorderWidth: "0.0",
				},
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Title",
				properties: { TextColor: "#FFFFFF", FontSize: "34.0" },
			},
			{
				collection: "LabelStyles",
				type: "LabelStyle",
				name: "Body",
				properties: { TextColor: "#F5F8FA", FontSize: "22.0" },
			},
			{
				collection: "ScreenStyles",
				type: "ScreenStyle",
				name: "Default",
				properties: { BackgroundColor: "#0F1B29", BorderColor: "#2C4A63", BorderThickness: "0.0" },
			},
		],
		rubric: {
			colourForStateOnly: false,
			minDensity: 35,
			maxDensity: 70,
			minTarget: 66,
			minFontSize: 18,
			maxFontSizes: 4,
			shadowAllowed: true,
			gradientAllowed: false,
			maxAccentShare: 22,
		},
	},
});

/** The language a new screen is built in unless the caller asks for another one. */
export const DEFAULT_LANGUAGE = "modern";

/** Every language name, in catalogue order. */
export const languageNames = Object.freeze(Object.keys(LANGUAGES));

/**
 * One language by name.
 * @param {string} [name] - Language name; the default language when omitted.
 * @returns {Language}
 * @throws {Error} When the name is not in the catalogue, naming the closest ones.
 */
export function getLanguage(name = DEFAULT_LANGUAGE) {
	const key = String(name ?? "").trim().toLowerCase();
	if (key === "") return LANGUAGES[DEFAULT_LANGUAGE];
	const found = LANGUAGES[key];
	if (found !== undefined) return found;
	const close = languageNames.filter((candidate) => candidate.startsWith(key.slice(0, 3)) || key.startsWith(candidate.slice(0, 3)));
	throw new Error(
		`no design language "${name}" - choose ${languageNames.join(", ")}${close.length > 0 ? ` (did you mean ${close.join(", ")}?)` : ""}`,
	);
}

/**
 * Validate a language definition. Used by the tests and by `languages` action, so a hand-added
 * language cannot ship half-formed.
 * @param {Language} language
 * @returns {string[]} Problems; empty when the language is usable.
 */
export function validateLanguage(language) {
	const problems = [];
	if (typeof language?.name !== "string" || language.name === "") problems.push("name is required");
	for (const [token, value] of Object.entries(language?.tokens ?? {})) {
		if (/color$/iu.test(token) && !COLOUR.test(String(value))) {
			problems.push(`token ${token} is not a #rrggbb colour: ${String(value)}`);
		}
		if (/radius|borderwidth|opacity|padding|shadow|glow|size/iu.test(token) && !SIZE.test(String(value))) {
			problems.push(`token ${token} is not a number: ${String(value)}`);
		}
	}
	for (const style of language?.styles ?? []) {
		if (!["ButtonStyles", "LabelStyles", "ScreenStyles", "NavigationPanelStyles", "ChartStyles"].includes(style.collection)) {
			problems.push(`style ${style.name} is in an unknown collection ${style.collection}`);
		}
		const allowed = STYLE_PROPERTIES[style.collection] ?? [];
		for (const [property, value] of Object.entries(style.properties ?? {})) {
			if (!allowed.includes(property)) problems.push(`style ${style.name}.${property} is not a property of ${style.collection}: the runtime knows ${allowed.join(", ")}`);
			if (typeof value !== "string") problems.push(`style ${style.name}.${property} must be a string`);
			if (/color$/iu.test(property) && !COLOUR.test(String(value))) {
				problems.push(`style ${style.name}.${property} is not a #rrggbb colour: ${String(value)}`);
			}
		}
	}
	const rubric = language?.rubric ?? {};
	for (const key of ["minDensity", "maxDensity", "minTarget", "minFontSize", "maxFontSizes", "maxAccentShare"]) {
		if (typeof rubric[key] !== "number") problems.push(`rubric.${key} must be a number`);
	}
	return problems;
}

/**
 * A compact catalogue for `optix_ui { action: "languages" }`.
 * @returns {object[]}
 */
export function languageCatalogue() {
	return languageNames.map((name) => {
		const language = LANGUAGES[name];
		return {
			name: language.name,
			title: language.title,
			description: language.description,
			dark: language.dark,
			default: name === DEFAULT_LANGUAGE,
			accent: language.tokens.AccentColor,
			window: language.tokens.WindowColor,
			font_size: language.tokens.FontPixelSize,
			radius: language.tokens.Radius,
			tokens: Object.keys(language.tokens).length,
			styles: language.styles.length,
			rubric: language.rubric,
		};
	});
}
