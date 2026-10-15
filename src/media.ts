export const suppliedMedia = [
  ["holdings-logo-transparent", "UniGlobe Holdings · transparent logo"],
  ["fashion-logo-transparent", "UniGlobe Fashion · transparent logo"],
  ...Array.from({ length: 6 }, (_, i) => [
    `product-${i + 1}`,
    `Supplied product image ${i + 1}`,
  ]),
].map(([id, name]) => ({ path: `/assets/${id}.webp`, name }));
