import { getKvProducts, setKvProducts, type KvProductsData, type KvProduct } from "./kv-cache";

// --- Constants ---
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN || "e-flight-academy.myshopify.com";
const SHOPIFY_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;

// --- L1: in-memory cache ---
let cachedProducts: KvProductsData | null = null;
let cacheTimestamp = 0;

// --- GraphQL query for products ---
const PRODUCTS_QUERY = `
  query GetProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          handle
          description
          productType
          vendor
          tags
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                price {
                  amount
                  currencyCode
                }
                availableForSale
              }
            }
          }
        }
      }
    }
  }
`;

interface ShopifyPrice {
  amount: string;
  currencyCode: string;
}

interface ShopifyVariant {
  id: string;
  title: string;
  price: ShopifyPrice;
  availableForSale: boolean;
}

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  productType: string;
  vendor: string;
  tags: string[];
  priceRange: {
    minVariantPrice: ShopifyPrice;
    maxVariantPrice: ShopifyPrice;
  };
  variants: {
    edges: { node: ShopifyVariant }[];
  };
}

interface ShopifyResponse {
  data: {
    products: {
      edges: { node: ShopifyProduct }[];
    };
  };
  errors?: { message: string }[];
}

async function fetchProductsFromShopify(): Promise<KvProduct[]> {
  if (!SHOPIFY_TOKEN) {
    console.warn("SHOPIFY_STOREFRONT_TOKEN not configured, skipping products");
    return [];
  }

  const endpoint = `https://${SHOPIFY_STORE}/api/2026-01/graphql.json`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": SHOPIFY_TOKEN,
    },
    body: JSON.stringify({
      query: PRODUCTS_QUERY,
      variables: { first: 100 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  const json: ShopifyResponse = await response.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Shopify GraphQL error: ${json.errors[0].message}`);
  }

  const products: KvProduct[] = json.data.products.edges.map(({ node }) => {
    const minPrice = parseFloat(node.priceRange.minVariantPrice.amount);
    const maxPrice = parseFloat(node.priceRange.maxVariantPrice.amount);
    const currency = node.priceRange.minVariantPrice.currencyCode;

    const variants = node.variants.edges.map(({ node: v }) => ({
      title: v.title,
      price: parseFloat(v.price.amount),
      available: v.availableForSale,
    }));

    return {
      title: node.title,
      handle: node.handle,
      description: node.description,
      productType: node.productType,
      tags: node.tags,
      minPrice,
      maxPrice,
      currency,
      variants,
      url: `https://www.eflight.nl/products/${node.handle}`,
    };
  });

  return products;
}

export async function syncProducts(): Promise<KvProduct[]> {
  console.log("Syncing Shopify products...");
  const products = await fetchProductsFromShopify();
  const data: KvProductsData = { products, cachedAt: Date.now() };
  cachedProducts = data;
  cacheTimestamp = Date.now();
  await setKvProducts(data);
  console.log(`Shopify sync complete: ${products.length} products`);
  return products;
}

export async function getProducts(): Promise<KvProduct[]> {
  // L1: in-memory
  if (cachedProducts && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProducts.products;
  }

  // L2: Redis
  try {
    const kvProducts = await getKvProducts();
    if (kvProducts && Date.now() - kvProducts.cachedAt < CACHE_TTL_MS) {
      cachedProducts = kvProducts;
      cacheTimestamp = kvProducts.cachedAt;
      return kvProducts.products;
    }
  } catch {
    // Fall through
  }

  // L3: Fetch from Shopify
  return syncProducts();
}

export function buildProductsContext(products: KvProduct[]): string {
  if (products.length === 0) return "";

  const entries = products.map((p) => {
    const priceStr = p.minPrice === p.maxPrice
      ? `${p.currency} ${p.minPrice.toFixed(2)}`
      : `${p.currency} ${p.minPrice.toFixed(2)} - ${p.maxPrice.toFixed(2)}`;

    const variantsStr = p.variants.length > 1
      ? `\nVariants: ${p.variants.map(v => `${v.title}: ${p.currency} ${v.price.toFixed(2)}${v.available ? "" : " (sold out)"}`).join(", ")}`
      : "";

    return `- ${p.title} (${priceStr})${p.productType ? ` [${p.productType}]` : ""}${variantsStr}\n  ${p.url}`;
  }).join("\n");

  return `=== E-Flight Shop Products & Prices ===\n${entries}`;
}
