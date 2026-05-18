export const catalog = {
  companies: [
    {
      name: 'CafeA',
      categories: [
        {
          name: 'Beverages',
          items: [
            { name: 'Tea', price: 20000 },
            { name: 'Coffee', price: 20000 },
          ],
        },
        {
          name: 'Food',
          items: [
            { name: 'Sandwich', price: 30000 },
            { name: 'Bread', price: 25000 },
          ],
        },
      ],
    },
    {
      name: 'CafeB',
      categories: [
        {
          name: 'Beverages',
          items: [
            { name: 'Tea', price: 20000 },
            { name: 'Coffee', price: 20000 },
          ],
        },
        {
          name: 'Food',
          items: [
            { name: 'Burger', price: 35000 },
            { name: 'Bread', price: 25000 },
          ],
        },
      ],
    },
  ],
};

export function getSortedCompanyNames() {
  return catalog.companies
    .map((company) => company.name)
    .sort((a, b) => a.localeCompare(b));
}
