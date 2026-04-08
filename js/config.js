/**
 * config.js — Default project configuration and schema management.
 * Defines the classification attributes schema and their possible values.
 * This can be overridden by importing a YAML or JSON config file.
 *
 * annotationTypes — named annotation types with tool, color, and label.
 *   tool: 'bbox' | 'polygon'
 *   color: hex/rgb color string for canvas rendering
 *   label: human-readable name
 *
 * allowNoTag (per attribute) — if true a "None" deselect button is shown,
 *   allowing an attribute to be left unclassified (zero classification).
 */

const DEFAULT_CONFIG = {
  project: "Cell Annotation Project",
  version: "1.0",

  // ── Annotation types ─────────────────────────────────────────────────────────
  // Each entry defines a named shape type the annotator can draw.
  annotationTypes: [
    {
      id:    "cell_bbox",
      label: "Cell BBox",
      tool:  "bbox",
      color: "#4FC3F7",          // sky blue
      fillOpacity: 0.08,
    },
    {
      id:    "nucleus_bbox",
      label: "Nucleus BBox",
      tool:  "bbox",
      color: "#FF8A65",          // deep orange
      fillOpacity: 0.10,
    },
    {
      id:    "cell_wall",
      label: "Cell Wall Trace",
      tool:  "trace",
      color: "#3FB950",          // green
      fillOpacity: 0.07,
    },
    {
      id:    "nucleus_wall",
      label: "Nucleus Wall Trace",
      tool:  "trace",
      color: "#CE93D8",          // purple
      fillOpacity: 0.10,
    },
  ],

  // ── Classification schema ─────────────────────────────────────────────────────
  // allowNoTag: true  → a "None" option appears so the attribute can be skipped.
  schema: [
    {
      section: "Cell Properties",
      attributes: [
        { key: "cell_size",  label: "Cell Size",  values: ["big", "small"],           allowNoTag: true },
        { key: "cell_shape", label: "Cell Shape", values: ["irregular", "round"],     allowNoTag: true },
      ]
    },
    {
      section: "Nucleus Properties",
      attributes: [
        {
          key: "nucleus_shape", label: "Nucleus Shape",
          values: ["irregular", "segmented-bilobed", "segmented-multilobed",
                   "unsegmented-band", "unsegmented-indented", "unsegmented-round"],
          allowNoTag: true,
        },
        { key: "nuclear_cytoplasmic_ratio", label: "N/C Ratio",        values: ["high", "low"],              allowNoTag: true },
        { key: "chromatin_density",         label: "Chromatin Density", values: ["densely", "loosely"],       allowNoTag: true },
      ]
    },
    {
      section: "Cytoplasm Properties",
      attributes: [
        { key: "cytoplasm_vacuole",  label: "Vacuole", values: ["no", "yes"],                                allowNoTag: true },
        { key: "cytoplasm_texture",  label: "Texture",  values: ["clear", "frosted"],                        allowNoTag: true },
        { key: "cytoplasm_colour",   label: "Colour",   values: ["blue", "light blue", "purple blue"],       allowNoTag: true },
      ]
    },
    {
      section: "Granule Properties",
      attributes: [
        { key: "granularity",    label: "Granularity",    values: ["no", "yes"],                             allowNoTag: true },
        { key: "granule_type",   label: "Granule Type",   values: ["coarse", "nil", "round", "small"],       allowNoTag: true },
        { key: "granule_colour", label: "Granule Colour", values: ["nil", "pink", "purple", "red"],          allowNoTag: true },
      ]
    },
  ],
};

// ─── Config Manager ────────────────────────────────────────────────────────────
const ConfigManager = (() => {
  let _config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  /** Load a JSON config object (from file import) */
  function loadFromObject(obj) {
    if (obj.schema || obj.annotationTypes) {
      _config = { ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)), ...obj };
    } else {
      _config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
  }

  /** Parse a raw JSON string */
  function loadFromJSON(jsonString) {
    try {
      const obj = JSON.parse(jsonString);
      loadFromObject(obj);
      return true;
    } catch (e) {
      console.error("Failed to parse JSON config:", e);
      return false;
    }
  }

  /** Very lightweight YAML fallback — advises to use JSON. */
  function loadFromYAML(yamlString) {
    try {
      if (yamlString.trim().startsWith('{')) return loadFromJSON(yamlString);
      console.warn("YAML import: basic parser used. Full schema changes require JSON.");
      return false;
    } catch (e) {
      console.error("Failed to parse YAML config:", e);
      return false;
    }
  }

  function get() { return _config; }
  function reset() { _config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }

  /** Get a flat list of all attribute keys */
  function getAllAttributeKeys() {
    return _config.schema.flatMap(s => s.attributes.map(a => a.key));
  }

  /** Return the annotation type definition by id */
  function getAnnotationType(id) {
    return (_config.annotationTypes || []).find(t => t.id === id) ?? null;
  }

  /** Return default annotation type id for a given tool */
  function getDefaultAnnotationTypeId(tool) {
    const types = _config.annotationTypes || [];
    const match = types.find(t => t.tool === tool);
    return match ? match.id : null;
  }

  return {
    get, reset,
    loadFromObject, loadFromJSON, loadFromYAML,
    getAllAttributeKeys, getAnnotationType, getDefaultAnnotationTypeId,
  };
})();
