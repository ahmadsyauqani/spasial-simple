export const ATTRIBUTE_TABLE_ROW_HEIGHT = 40;
export const ATTRIBUTE_TABLE_OVERSCAN = 6;

export type AttributeTableFeature = {
  properties?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AttributeTableRow = {
  feature: AttributeTableFeature;
  originalIndex: number;
};

export type AttributeTableVirtualWindow = {
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
};

/**
 * Keep the source feature index separate from the rendered row position.
 * Filtering and virtualization can then never redirect an edit or selection
 * to a different feature.
 */
export function indexAndFilterFeatures(
  features: readonly AttributeTableFeature[],
  searchTerm: string,
): AttributeTableRow[] {
  if (!searchTerm) {
    return features.map((feature, originalIndex) => ({ feature, originalIndex }));
  }

  const lowerSearch = searchTerm.toLowerCase();
  const rows: AttributeTableRow[] = [];
  features.forEach((feature, originalIndex) => {
    const properties = feature?.properties;
    if (!properties) return;
    const matches = Object.values(properties).some((value) =>
      String(value).toLowerCase().includes(lowerSearch),
    );
    if (matches) rows.push({ feature, originalIndex });
  });
  return rows;
}

/**
 * Calculate a fixed-height table window with spacer rows. The returned range
 * is intentionally independent of the feature objects, so it is cheap to
 * recompute on scroll and safe to use for filtered rows.
 */
export function getVirtualWindow(
  totalRows: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = ATTRIBUTE_TABLE_ROW_HEIGHT,
  overscan = ATTRIBUTE_TABLE_OVERSCAN,
): AttributeTableVirtualWindow {
  const total = Math.max(0, Math.floor(totalRows));
  const height = Math.max(1, rowHeight);
  const safeScrollTop = Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0);
  const safeViewportHeight = Math.max(
    height,
    Number.isFinite(viewportHeight) ? viewportHeight : height,
  );
  const safeOverscan = Math.max(0, Math.floor(overscan));
  const firstVisible = Math.min(total, Math.floor(safeScrollTop / height));
  const lastVisible = Math.min(
    total,
    Math.ceil((safeScrollTop + safeViewportHeight) / height),
  );
  const startIndex = Math.max(0, firstVisible - safeOverscan);
  const endIndex = Math.min(total, lastVisible + safeOverscan);

  return {
    startIndex,
    endIndex: Math.max(startIndex, endIndex),
    topSpacerHeight: startIndex * height,
    bottomSpacerHeight: Math.max(0, (total - endIndex) * height),
  };
}
