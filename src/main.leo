// zk_invoice_v2_2.aleo — Wave2 audit + selective disclosure + counters

program zk_invoice_v2_2.aleo {

    // ========= Program lifecycle =========
    @noupgrade
    async constructor() {}

    // ========= Status constants =========
    const STATUS_PENDING: u8 = 0u8;
    const STATUS_PAID: u8 = 1u8;
    const STATUS_CANCELLED: u8 = 2u8;
    const STATUS_EXPIRED: u8 = 3u8;

    // ========= Struct definitions =========
    struct InvoiceData {
        seller: address,
        buyer: address,
        amount: u64,
        due_date: u32,
        invoice_number: field
    }

    struct PaymentData {
        invoice_id: field,
        payer: address,
        payee: address,
        payment_nonce: field
    }

    struct FieldCommitments {
        amount: field,
        tax_amount: field,
        due_date: field,
        buyer: field,
        seller: field,
        currency: field,
        items_hash: field,
        memo_hash: field,
        order_id: field
    }

    struct AuditAuthorization {
        audit_key_hash: field,
        scopes_bitmask: u64,
        expires_at: u32,
        issuer: address
    }

    struct InvoiceHashInput {
        seller: address,
        buyer: address,
        amount: u64,
        tax_amount: u64,
        due_date: u32,
        nonce: field,
        order_id: field,
        currency: field,
        items_hash: field,
        memo_hash: field
    }

    struct FieldCommitInput {
        val: field,
        salt: field,
        tag: field
    }

    struct RulesBits {
        r1: bool,
        r2: bool,
        r3: bool,
        r4: bool,
        r5: bool
    }

    // ========= Record definitions =========
    record InvoiceRecord {
        owner: address,        // Record holder (seller or buyer)
        invoice_id: field,     // Unique invoice identifier
        seller: address,       // Seller address
        buyer: address,        // Buyer address
        amount: u64,           // Amount in microcredits
        tax_amount: u64,       // Declared tax amount
        invoice_hash: field,   // Hash of invoice details
        due_date: u32,         // Due date timestamp (seconds)
        created_at: u32,       // Creation timestamp (seconds, provided by frontend)
        status: u8,            // 0=PENDING, 1=PAID, 2=CANCELLED, 3=EXPIRED
        order_id: field,       // Optional order linkage (0field if unused)
        currency: field,       // Currency code hashed to field
        items_hash: field,     // Hash/commitment of line items
        memo_hash: field       // Optional memo hash (0field if unused)
    }

    record PaymentRecord {
        owner: address,        // Receipt holder
        payment_id: field,     // Unique payment identifier
        invoice_id: field,     // Related invoice ID
        payer: address,        // Payer address
        payee: address,        // Payee address
        amount: u64,           // Payment amount
        paid_at: u32           // Payment timestamp (seconds, provided by frontend)
    }

    // ========= Public mappings =========
    mapping invoice_registry: field => field;                 // invoice_id => invoice_hash
    mapping invoice_status: field => u8;                      // invoice_id => status
    mapping invoice_count: address => u64;                    // seller => count (legacy metric)
    mapping invoice_commitment: field => field;               // invoice_id => commitment root
    mapping invoice_field_commitments: field => FieldCommitments; // invoice_id => per-field commitments
    mapping invoice_rules_result: field => field;             // invoice_id => rules_result hash
    mapping audit_authorization: field => AuditAuthorization; // invoice_id => audit auth
    mapping audit_counter: address => u64;                    // seller => audit counter
    // Getter caches (for public reads via finalize)
    mapping getter_commitment_cache: field => field;
    mapping getter_field_commitments_cache: field => FieldCommitments;
    mapping getter_rules_cache: field => field;
    mapping getter_auth_cache: field => AuditAuthorization;
    mapping getter_counter_cache: address => u64;

    // ========= Helpers =========
    function compute_invoice_id_internal(
        seller: address,
        buyer: address,
        amount: u64,
        due_date: u32,
        nonce: field
    ) -> field {
        let data: InvoiceData = InvoiceData {
            seller: seller,
            buyer: buyer,
            amount: amount,
            due_date: due_date,
            invoice_number: nonce
        };
        return BHP256::hash_to_field(data);
    }

    function compute_invoice_hash_internal(
        seller: address,
        buyer: address,
        amount: u64,
        tax_amount: u64,
        due_date: u32,
        nonce: field,
        order_id: field,
        currency: field,
        items_hash: field,
        memo_hash: field
    ) -> field {
        let input: InvoiceHashInput = InvoiceHashInput {
            seller: seller,
            buyer: buyer,
            amount: amount,
            tax_amount: tax_amount,
            due_date: due_date,
            nonce: nonce,
            order_id: order_id,
            currency: currency,
            items_hash: items_hash,
            memo_hash: memo_hash
        };
        return BHP256::hash_to_field(input);
    }

    function commit_field(value: field, salt: field, tag: field) -> field {
        let input: FieldCommitInput = FieldCommitInput {
            val: value,
            salt: salt,
            tag: tag
        };
        return BHP256::hash_to_field(input);
    }

    function compute_rules_result(
        r1: bool,
        r2: bool,
        r3: bool,
        r4: bool,
        r5: bool
    ) -> field {
        let bits: RulesBits = RulesBits {
            r1: r1,
            r2: r2,
            r3: r3,
            r4: r4,
        r5: r5
    };
        return BHP256::hash_to_field(bits);
    }


    // ========= Core transitions =========

    // Create invoice with commitments, rules_result, and counters
    async transition create_invoice(
        buyer: address,
        amount: u64,
        tax_amount: u64,
        due_date: u32,
        invoice_hash: field,
        nonce: field,
        current_time: u32,
        order_id: field,
        currency: field,
        items_hash: field,
        memo_hash: field,
        line_items_sum: u64,
        expected_total: u64,
        tax_rate_bps: u64
    ) -> (InvoiceRecord, InvoiceRecord, Future) {
        let seller: address = self.caller;

        // Basic validation
        assert_neq(seller, buyer);
        assert(amount > 0u64);
        assert(due_date >= current_time); // R2 issue-time check
        // Deterministic invoice_id and hash
        let invoice_id: field = compute_invoice_id_internal(seller, buyer, amount, due_date, nonce);
        let computed_hash: field = compute_invoice_hash_internal(
            seller,
            buyer,
            amount,
            tax_amount,
            due_date,
            nonce,
            order_id,
            currency,
            items_hash,
            memo_hash
        );
        // R3: chain hash must match computed
        assert_eq(invoice_hash, computed_hash);

        // Business rules (R1–R5)
        let expected_tax: u64 = amount * tax_rate_bps / 10000u64;
        let r1_tax_ok: bool = tax_amount == expected_tax;
        let r2_due_ok: bool = due_date >= current_time;
        let r3_total_ok: bool = amount + tax_amount == expected_total;
        let r4_items_ok: bool = line_items_sum == amount;
        let r5_hash_ok: bool = invoice_hash == computed_hash;
        let rules_result: field = compute_rules_result(
            r1_tax_ok,
            r2_due_ok,
            r3_total_ok,
            r4_items_ok,
            r5_hash_ok
        );

        // Field commitments (salt = nonce, tag = unique field marker)
        let c_amount: field = commit_field(amount as field, nonce, 1field);
        let c_tax: field = commit_field(tax_amount as field, nonce, 2field);
        let c_due: field = commit_field(due_date as field, nonce, 3field);
        let c_buyer: field = commit_field(buyer as field, nonce, 4field);
        let c_seller: field = commit_field(seller as field, nonce, 5field);
        let c_currency: field = commit_field(currency, nonce, 6field);
        let c_items_hash: field = commit_field(items_hash, nonce, 7field);
        let c_memo_hash: field = commit_field(memo_hash, nonce, 8field);
        let c_order_id: field = commit_field(order_id, nonce, 9field);

        let commitments: FieldCommitments = FieldCommitments {
            amount: c_amount,
            tax_amount: c_tax,
            due_date: c_due,
            buyer: c_buyer,
            seller: c_seller,
            currency: c_currency,
            items_hash: c_items_hash,
            memo_hash: c_memo_hash,
            order_id: c_order_id
        };

        let commitment_root: field = BHP256::hash_to_field(commitments);

        // Seller copy
        let seller_record: InvoiceRecord = InvoiceRecord {
            owner: seller,
            invoice_id: invoice_id,
            seller: seller,
            buyer: buyer,
            amount: amount,
            tax_amount: tax_amount,
            invoice_hash: invoice_hash,
            due_date: due_date,
            created_at: current_time,
            status: STATUS_PENDING,
            order_id: order_id,
            currency: currency,
            items_hash: items_hash,
            memo_hash: memo_hash
        };

        // Buyer copy
        let buyer_record: InvoiceRecord = InvoiceRecord {
            owner: buyer,
            invoice_id: invoice_id,
            seller: seller,
            buyer: buyer,
            amount: amount,
            tax_amount: tax_amount,
            invoice_hash: invoice_hash,
            due_date: due_date,
            created_at: current_time,
            status: STATUS_PENDING,
            order_id: order_id,
            currency: currency,
            items_hash: items_hash,
            memo_hash: memo_hash
        };

        // Async finalize writes public anchors
        return (
            seller_record,
            buyer_record,
            finalize_create_invoice(
                invoice_id,
                invoice_hash,
                seller,
                commitment_root,
                commitments,
                rules_result
            )
        );
    }

    async function finalize_create_invoice(
        public invoice_id: field,
        public invoice_hash: field,
        public seller: address,
        public commitment_root: field,
        public commitments: FieldCommitments,
        public rules_result: field
    ) {
        // Replay protection: invoice_id must be unused
        let existing_hash: field = Mapping::get_or_use(invoice_registry, invoice_id, 0field);
        assert_eq(existing_hash, 0field);

        Mapping::set(invoice_registry, invoice_id, invoice_hash);
        Mapping::set(invoice_status, invoice_id, STATUS_PENDING);
        Mapping::set(invoice_commitment, invoice_id, commitment_root);
        Mapping::set(invoice_field_commitments, invoice_id, commitments);
        Mapping::set(invoice_rules_result, invoice_id, rules_result);

        let current_count: u64 = Mapping::get_or_use(invoice_count, seller, 0u64);
        Mapping::set(invoice_count, seller, current_count + 1u64);

        let audit_count: u64 = Mapping::get_or_use(audit_counter, seller, 0u64);
        Mapping::set(audit_counter, seller, audit_count + 1u64);
    }

    // Mark invoice as paid, assert due_date not passed, finalize status
    async transition mark_as_paid(
        invoice: InvoiceRecord,
        payment_nonce: field,
        paid_at: u32
    ) -> (PaymentRecord, InvoiceRecord, Future) {
        let payer: address = self.caller;

        assert_eq(payer, invoice.buyer);
        assert_eq(invoice.status, STATUS_PENDING);
        assert(paid_at <= invoice.due_date); // R2 payment-time check

        let payment_data: PaymentData = PaymentData {
            invoice_id: invoice.invoice_id,
            payer: payer,
            payee: invoice.seller,
            payment_nonce: payment_nonce
        };
        let payment_id: field = BHP256::hash_to_field(payment_data);

        let receipt: PaymentRecord = PaymentRecord {
            owner: payer,
            payment_id: payment_id,
            invoice_id: invoice.invoice_id,
            payer: payer,
            payee: invoice.seller,
            amount: invoice.amount,
            paid_at: paid_at
        };

        let updated_invoice: InvoiceRecord = InvoiceRecord {
            owner: invoice.owner,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            tax_amount: invoice.tax_amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_PAID,
            order_id: invoice.order_id,
            currency: invoice.currency,
            items_hash: invoice.items_hash,
            memo_hash: invoice.memo_hash
        };

        return (
            receipt,
            updated_invoice,
            finalize_mark_as_paid(invoice.invoice_id)
        );
    }

    async function finalize_mark_as_paid(
        public invoice_id: field
    ) {
        Mapping::set(invoice_status, invoice_id, STATUS_PAID);
    }

    // Cancel invoice (seller only), finalize status change and counters
    async transition cancel_invoice(
        invoice: InvoiceRecord
    ) -> (InvoiceRecord, Future) {
        let caller: address = self.caller;

        assert_eq(caller, invoice.seller);
        assert_eq(invoice.status, STATUS_PENDING);

        let cancelled_invoice: InvoiceRecord = InvoiceRecord {
            owner: invoice.owner,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            tax_amount: invoice.tax_amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_CANCELLED,
            order_id: invoice.order_id,
            currency: invoice.currency,
            items_hash: invoice.items_hash,
            memo_hash: invoice.memo_hash
        };

        return (
            cancelled_invoice,
            finalize_cancel_invoice(invoice.invoice_id, invoice.seller)
        );
    }

    async function finalize_cancel_invoice(
        public invoice_id: field,
        public seller: address
    ) {
        Mapping::set(invoice_status, invoice_id, STATUS_CANCELLED);
        let current_count: u64 = Mapping::get_or_use(audit_counter, seller, 0u64);
        if current_count > 0u64 {
            Mapping::set(audit_counter, seller, current_count - 1u64);
        }
    }

    // Set or update audit authorization (only invoice owner/seller)
    async transition set_audit_authorization(
        invoice: InvoiceRecord,
        audit_key_hash: field,
        scopes_bitmask: u64,
        expires_at: u32,
        current_time: u32
    ) -> Future {
        let caller: address = self.caller;
        assert_eq(caller, invoice.seller);
        assert(expires_at >= current_time); // prevent expired grants

        let auth: AuditAuthorization = AuditAuthorization {
            audit_key_hash: audit_key_hash,
            scopes_bitmask: scopes_bitmask,
            expires_at: expires_at,
            issuer: caller
        };

        return finalize_set_audit_auth(invoice.invoice_id, auth);
    }

    async function finalize_set_audit_auth(
        public invoice_id: field,
        public auth: AuditAuthorization
    ) {
        Mapping::set(audit_authorization, invoice_id, auth);
    }

    // ========= Auxiliary transitions =========

    transition verify_invoice_hash(
        invoice: InvoiceRecord,
        expected_hash: field
    ) -> bool {
        return invoice.invoice_hash == expected_hash;
    }

    transition verify_payment(
        receipt: PaymentRecord,
        invoice: InvoiceRecord
    ) -> bool {
        let matches_invoice: bool = receipt.invoice_id == invoice.invoice_id;
        let matches_amount: bool = receipt.amount == invoice.amount;
        let matches_parties: bool = (receipt.payer == invoice.buyer) && (receipt.payee == invoice.seller);
        return matches_invoice && matches_amount && matches_parties;
    }

    // ========== ZK-friendly proof helpers ==========

    transition prove_tax_compliance(
        invoice: InvoiceRecord,
        tax_rate_bps: u64
    ) -> bool {
        let expected_tax: u64 = invoice.amount * tax_rate_bps / 10000u64;
        return invoice.tax_amount == expected_tax;
    }

    transition prove_amount_in_range(
        invoice: InvoiceRecord,
        min_amount: u64,
        max_amount: u64
    ) -> bool {
        return (invoice.amount >= min_amount) && (invoice.amount <= max_amount);
    }

    transition prove_invoice_ownership(
        invoice: InvoiceRecord,
        expected_seller: address,
        expected_buyer: address
    ) -> bool {
        return (invoice.seller == expected_seller) && (invoice.buyer == expected_buyer);
    }

    // On-chain assertions tying proofs back to stored anchors
    async transition assert_amount_anchor(
        invoice: InvoiceRecord,
        expected_hash: field,
        min_amount: u64,
        max_amount: u64
    ) -> Future {
        assert(invoice.invoice_hash == expected_hash);
        assert(invoice.amount >= min_amount);
        assert(invoice.amount <= max_amount);
        return finalize_assert_amount(invoice.invoice_id, expected_hash);
    }

    async function finalize_assert_amount(
        public invoice_id: field,
        public expected_hash: field
    ) {
        let stored: field = Mapping::get_or_use(invoice_registry, invoice_id, 0field);
        assert_eq(stored, expected_hash);
    }

    async transition assert_ownership_anchor(
        invoice: InvoiceRecord,
        expected_hash: field,
        expected_seller: address,
        expected_buyer: address
    ) -> Future {
        assert(invoice.invoice_hash == expected_hash);
        assert(invoice.seller == expected_seller);
        assert(invoice.buyer == expected_buyer);
        return finalize_assert_owner(invoice.invoice_id, expected_hash);
    }

    async function finalize_assert_owner(
        public invoice_id: field,
        public expected_hash: field
    ) {
        let stored: field = Mapping::get_or_use(invoice_registry, invoice_id, 0field);
        assert_eq(stored, expected_hash);
    }

    // Recompute rules_result for audit packages
    transition compute_rules_proof(
        invoice: InvoiceRecord,
        current_time: u32,
        line_items_sum: u64,
        expected_total: u64,
        tax_rate_bps: u64,
        expected_hash: field
    ) -> field {
        let expected_tax: u64 = invoice.amount * tax_rate_bps / 10000u64;
        let r1_tax_ok: bool = invoice.tax_amount == expected_tax;
        let r2_due_ok: bool = invoice.due_date >= current_time;
        let r3_total_ok: bool = invoice.amount + invoice.tax_amount == expected_total;
        let r4_items_ok: bool = line_items_sum == invoice.amount;
        let r5_hash_ok: bool = invoice.invoice_hash == expected_hash;
        return compute_rules_result(
            r1_tax_ok,
            r2_due_ok,
            r3_total_ok,
            r4_items_ok,
            r5_hash_ok
        );
    }

    // Assert rules_result against on-chain anchor
    async transition assert_rules_anchor(
        invoice_id: field,
        expected_rules: field
    ) -> Future {
        return finalize_assert_rules(invoice_id, expected_rules);
    }

    async function finalize_assert_rules(
        public invoice_id: field,
        public expected_rules: field
    ) {
        let stored: field = Mapping::get_or_use(invoice_rules_result, invoice_id, 0field);
        assert_eq(stored, expected_rules);
    }

    transition create_seller_receipt(
        invoice_id: field,
        payer: address,
        payee: address,
        amount: u64,
        payment_nonce: field,
        paid_at: u32
    ) -> PaymentRecord {
        let seller: address = self.caller;
        assert_eq(seller, payee);

        let payment_data: PaymentData = PaymentData {
            invoice_id: invoice_id,
            payer: payer,
            payee: payee,
            payment_nonce: payment_nonce
        };
        let payment_id: field = BHP256::hash_to_field(payment_data);

        let receipt: PaymentRecord = PaymentRecord {
            owner: seller,
            payment_id: payment_id,
            invoice_id: invoice_id,
            payer: payer,
            payee: payee,
            amount: amount,
            paid_at: paid_at
        };

        return receipt;
    }

    transition compute_invoice_id(
        seller: address,
        buyer: address,
        amount: u64,
        due_date: u32,
        nonce: field
    ) -> field {
        return compute_invoice_id_internal(seller, buyer, amount, due_date, nonce);
    }

    transition compute_invoice_hash(
        seller: address,
        buyer: address,
        amount: u64,
        tax_amount: u64,
        due_date: u32,
        nonce: field,
        order_id: field,
        currency: field,
        items_hash: field,
        memo_hash: field
    ) -> field {
        return compute_invoice_hash_internal(
            seller,
            buyer,
            amount,
            tax_amount,
            due_date,
            nonce,
            order_id,
            currency,
            items_hash,
            memo_hash
        );
    }

    // Utility: expose caller for testing/integration
    transition get_caller() -> address {
        return self.caller;
    }

    // ========= Public getters (read via finalize caches) =========

    async transition get_invoice_commitment(
        invoice_id: field
    ) -> Future {
        return finalize_get_invoice_commitment(invoice_id);
    }

    async function finalize_get_invoice_commitment(
        public invoice_id: field
    ) {
        let c: field = Mapping::get_or_use(invoice_commitment, invoice_id, 0field);
        Mapping::set(getter_commitment_cache, invoice_id, c);
    }

    async transition get_invoice_field_commitments(
        invoice_id: field
    ) -> Future {
        return finalize_get_fields(invoice_id);
    }

    async function finalize_get_fields(
        public invoice_id: field
    ) {
        let fc: FieldCommitments = Mapping::get_or_use(
            invoice_field_commitments,
            invoice_id,
            FieldCommitments {
                amount: 0field,
                tax_amount: 0field,
                due_date: 0field,
                buyer: 0field,
                seller: 0field,
                currency: 0field,
                items_hash: 0field,
                memo_hash: 0field,
                order_id: 0field
            }
        );
        Mapping::set(getter_field_commitments_cache, invoice_id, fc);
    }

    async transition get_rules_result(
        invoice_id: field
    ) -> Future {
        return finalize_get_rules_result(invoice_id);
    }

    async function finalize_get_rules_result(
        public invoice_id: field
    ) {
        let r: field = Mapping::get_or_use(invoice_rules_result, invoice_id, 0field);
        Mapping::set(getter_rules_cache, invoice_id, r);
    }

    async transition get_audit_authorization(
        invoice_id: field
    ) -> Future {
        return finalize_get_auth(invoice_id);
    }

    async function finalize_get_auth(
        public invoice_id: field
    ) {
        let auth: AuditAuthorization = Mapping::get_or_use(
            audit_authorization,
            invoice_id,
            AuditAuthorization {
                audit_key_hash: 0field,
                scopes_bitmask: 0u64,
                expires_at: 0u32,
                issuer: aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc
            }
        );
        Mapping::set(getter_auth_cache, invoice_id, auth);
    }

    async transition get_audit_counter(
        seller: address
    ) -> Future {
        return finalize_get_audit_counter(seller);
    }

    async function finalize_get_audit_counter(
        public seller: address
    ) {
        let c: u64 = Mapping::get_or_use(audit_counter, seller, 0u64);
        Mapping::set(getter_counter_cache, seller, c);
    }

    // Assert commitments / counters for testing or API verification
    async transition assert_commitment_anchor(
        invoice_id: field,
        expected_commitment: field
    ) -> Future {
        return finalize_assert_commitment(invoice_id, expected_commitment);
    }

    async function finalize_assert_commitment(
        public invoice_id: field,
        public expected_commitment: field
    ) {
        let stored: field = Mapping::get_or_use(invoice_commitment, invoice_id, 0field);
        assert_eq(stored, expected_commitment);
    }

    async transition assert_field_commitments_anchor(
        invoice_id: field,
        expected_root: field
    ) -> Future {
        return finalize_assert_fields(invoice_id, expected_root);
    }

    async function finalize_assert_fields(
        public invoice_id: field,
        public expected_root: field
    ) {
        let fc: FieldCommitments = Mapping::get_or_use(
            invoice_field_commitments,
            invoice_id,
            FieldCommitments {
                amount: 0field,
                tax_amount: 0field,
                due_date: 0field,
                buyer: 0field,
                seller: 0field,
                currency: 0field,
                items_hash: 0field,
                memo_hash: 0field,
                order_id: 0field
            }
        );
        let root: field = BHP256::hash_to_field(fc);
        assert_eq(root, expected_root);
    }

    async transition assert_audit_auth_anchor(
        invoice_id: field,
        expected_hash: field,
        expected_scopes: u64,
        expected_expires: u32
    ) -> Future {
        return finalize_assert_auth(invoice_id, expected_hash, expected_scopes, expected_expires);
    }

    async function finalize_assert_auth(
        public invoice_id: field,
        public expected_hash: field,
        public expected_scopes: u64,
        public expected_expires: u32
    ) {
        let auth: AuditAuthorization = Mapping::get_or_use(
            audit_authorization,
            invoice_id,
            AuditAuthorization {
                audit_key_hash: 0field,
                scopes_bitmask: 0u64,
                expires_at: 0u32,
                issuer: aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc
            }
        );
        assert_eq(auth.audit_key_hash, expected_hash);
        assert_eq(auth.scopes_bitmask, expected_scopes);
        assert_eq(auth.expires_at, expected_expires);
    }

    async transition assert_audit_counter_anchor(
        seller: address,
        expected_count: u64
    ) -> Future {
        return finalize_assert_counter(seller, expected_count);
    }

    async function finalize_assert_counter(
        public seller: address,
        public expected_count: u64
    ) {
        let c: u64 = Mapping::get_or_use(audit_counter, seller, 0u64);
        assert_eq(c, expected_count);
    }

    // ========== Test-only helper (allows buyer-specified payer for mark_as_paid) ==========
    async transition test_mark_as_paid_with_payer(
        invoice: InvoiceRecord,
        payer: address,
        payment_nonce: field,
        paid_at: u32
    ) -> (PaymentRecord, InvoiceRecord, Future) {
        assert_eq(payer, invoice.buyer);
        assert_eq(invoice.status, STATUS_PENDING);
        assert(paid_at <= invoice.due_date);

        let payment_data: PaymentData = PaymentData {
            invoice_id: invoice.invoice_id,
            payer: payer,
            payee: invoice.seller,
            payment_nonce: payment_nonce
        };
        let payment_id: field = BHP256::hash_to_field(payment_data);

        let receipt: PaymentRecord = PaymentRecord {
            owner: payer,
            payment_id: payment_id,
            invoice_id: invoice.invoice_id,
            payer: payer,
            payee: invoice.seller,
            amount: invoice.amount,
            paid_at: paid_at
        };

        let updated_invoice: InvoiceRecord = InvoiceRecord {
            owner: invoice.owner,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            tax_amount: invoice.tax_amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_PAID,
            order_id: invoice.order_id,
            currency: invoice.currency,
            items_hash: invoice.items_hash,
            memo_hash: invoice.memo_hash
        };

        return (
            receipt,
            updated_invoice,
            finalize_mark_as_paid(invoice.invoice_id)
        );
    }

}
