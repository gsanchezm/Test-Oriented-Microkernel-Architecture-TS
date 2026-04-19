import { featureToRows } from '../../../../plugins/gatling/support/feature-to-rows';

export type CheckoutRow = Record<string, unknown> & {
    market:   string;
    item:     string;
    size:     string;
    qty:      number;
    street:   string;
    zip:      string;
    suburb:   string;
    name:     string;
    phone:    string;
    payment:  string;
    card:     string;
    exp:      string;
    cvv:      string;
};

const FEATURE_PATH = 'src/core/tests/checkout/features/place-delivery-order.feature';

const SCENARIOS: Array<{ name: string; payment: string }> = [
    { name: 'Place a delivery order in <market> paying with credit card', payment: 'Credit Card' },
    { name: 'Place a delivery order in <market> paying with cash',        payment: 'Cash' },
];

/**
 * Returns CheckoutRow[] ready for Gatling arrayFeeder().
 * Parses both credit card and cash Scenario Outlines and merges them;
 * the payment column is injected from the scenario name (not the Examples table).
 */
export function featureToCheckoutRows(includePayments?: string[]): CheckoutRow[] {
    const wanted = includePayments
        ? SCENARIOS.filter(s => includePayments.includes(s.payment))
        : SCENARIOS;

    return wanted.flatMap(({ name, payment }) =>
        featureToRows<CheckoutRow>(
            { featurePath: FEATURE_PATH, scenarioName: name },
            (row) => ({
                market:  row['market'],
                item:    row['item'],
                size:    row['size'],
                qty:     parseInt(row['qty'], 10),
                street:  row['street'],
                zip:     row['zip'],
                suburb:  row['suburb'] ?? '',
                name:    row['name'],
                phone:   row['phone'],
                payment,
                card:    row['card']   ?? '',
                exp:     row['exp']    ?? '',
                cvv:     row['cvv']    ?? '',
            }),
        ),
    );
}
