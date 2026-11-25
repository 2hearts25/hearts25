# Payment card security checklist

Production decision: live full-card collection stays disabled. The separate optional financial-information flow can proceed with the card collection guard off. Private-pay tuition is deferred.

| Control | Readiness and remaining work |
| --- | --- |
| Independent kill switch | The Edge Function requires both financial_card_collection and a separate H2H_FINANCIAL_KEY. Production flag was verified off and the restricted card table was empty. Isolated testing rejected collection while disabled. |
| Stored card data | Source review found application-layer AES-GCM encryption, separate restricted storage, service-only RPCs, and last-four-only display. The application rejects extra fields such as CVV. Migration 2 permission assertions passed. These are implementation controls, and a production PCI assessment is outstanding. |
| Business need and PCI scope | Management and its acquiring bank or compliance assessor must document the business need for storing full PAN, confirm the applicable validation obligations and assess the browser, API, storage, backups, logs, vendors and keys in scope. Consider processor-hosted tokenization as part of that decision. |
| Retention and deletion | Approve a minimum necessary retention schedule, define ownership, and ensure every stored record automatically receives a deadline. The current purge skips records with a null deadline. Verify expiry, backup handling and disposal using synthetic data. |
| Secret lifecycle and access | Before activation, implement and verify dedicated key generation, storage, rotation and recovery. Document authorized roles, least privilege, access reviews, audit monitoring and incident response. Do not use the enrollment-data key for card records. |
| Verification and authorization | Verify protected transport, restricted access, encrypted backups, no PAN in analytics/logs/other application records, masked output, expiry and the kill switch with synthetic data. Record management authorization and applicable compliance sign-off before enabling the production flag. |

[PCI SSC on protecting stored PAN](https://www.pcisecuritystandards.org/faqs/1222/) and [retention and disposal](https://www.pcisecuritystandards.org/faqs/1318/).
