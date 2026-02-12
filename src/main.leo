// zk_invoice_v2.aleo — Wave 2 contract with public mappings, async/finalize, and ZK compliance proofs
// All UI copy and code comments remain English-only per project guideline.

program zk_invoice_v2.aleo {

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

    // ========= Record definitions =========
    record InvoiceRecord {
        owner: address,        // Record holder (seller or buyer)
        invoice_id: field,     // Unique invoice identifier
        seller: address,       // Seller address
        buyer: address,        // Buyer address
        amount: u64,           // Amount in microcredits
        invoice_hash: field,   // Hash of invoice details
        due_date: u32,         // Due date timestamp (seconds)
        created_at: u32,       // Creation timestamp (seconds, provided by frontend)
        status: u8,            // 0=PENDING, 1=PAID, 2=CANCELLED, 3=EXPIRED
        order_id: field,       // Optional order linkage (0field if unused)
        tax_amount: u64        // Declared tax amount, used by ZK tax compliance proof
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

    record AuditReport {
        owner: address,        // Auditor address (record owner)
        invoice_id: field,     // Audited invoice
        audit_type: u8,        // 0=tax, 1=range, 2=ownership
        result: bool,          // Compliance result
        audited_at: u32,       // Audit timestamp (seconds)
        auditor: address       // Auditor identity
    }

    // ========= Public mappings (minimal anchors) =========
    // invoice_id => invoice_hash (public anchor, no business-sensitive fields)
    mapping invoice_registry: field => field;
    // invoice_id => status (u8)
    mapping invoice_status: field => u8;
    // seller => invoice_count (optional transparency metric)
    mapping invoice_count: address => u64;

    // ========= Core transitions (async with finalize) =========

    // Create invoice, return two private records + finalize writes public anchors
    async transition create_invoice(
        buyer: address,
        amount: u64,
        due_date: u32,
        invoice_hash: field,
        nonce: field,
        current_time: u32,
        order_id: field,
        tax_amount: u64
    ) -> (InvoiceRecord, InvoiceRecord, Future) {
        let seller: address = self.caller;

        // Basic validation
        assert_neq(seller, buyer);
        assert(amount > 0u64);

        // Compute invoice_id deterministically
        let invoice_data: InvoiceData = InvoiceData {
            seller: seller,
            buyer: buyer,
            amount: amount,
            due_date: due_date,
            invoice_number: nonce
        };
        let invoice_id: field = BHP256::hash_to_field(invoice_data);

        // Seller copy
        let seller_record: InvoiceRecord = InvoiceRecord {
            owner: seller,
            invoice_id: invoice_id,
            seller: seller,
            buyer: buyer,
            amount: amount,
            invoice_hash: invoice_hash,
            due_date: due_date,
            created_at: current_time,
            status: STATUS_PENDING,
            order_id: order_id,
            tax_amount: tax_amount
        };

        // Buyer copy
        let buyer_record: InvoiceRecord = InvoiceRecord {
            owner: buyer,
            invoice_id: invoice_id,
            seller: seller,
            buyer: buyer,
            amount: amount,
            invoice_hash: invoice_hash,
            due_date: due_date,
            created_at: current_time,
            status: STATUS_PENDING,
            order_id: order_id,
            tax_amount: tax_amount
        };

        // Async finalize writes minimal public anchors
        return (
            seller_record,
            buyer_record,
            finalize_create_invoice(invoice_id, invoice_hash, seller)
        );
    }

    async function finalize_create_invoice(
        public invoice_id: field,
        public invoice_hash: field,
        public seller: address
    ) {
        // Anchor invoice hash
        Mapping::set(invoice_registry, invoice_id, invoice_hash);
        // Initial status = PENDING
        Mapping::set(invoice_status, invoice_id, STATUS_PENDING);
        // Increment seller invoice count (optional transparency metric)
        let current_count: u64 = Mapping::get_or_use(invoice_count, seller, 0u64);
        Mapping::set(invoice_count, seller, current_count + 1u64);
    }

    // Mark invoice as paid, emit receipt and finalize status update
    async transition mark_as_paid(
        invoice: InvoiceRecord,
        payment_nonce: field,
        paid_at: u32
    ) -> (PaymentRecord, InvoiceRecord, Future) {
        let payer: address = self.caller;

        // Validation: only buyer can mark as paid
        assert_eq(payer, invoice.buyer);
        // Must be pending
        assert_eq(invoice.status, STATUS_PENDING);

        // Build payment id
        let payment_data: PaymentData = PaymentData {
            invoice_id: invoice.invoice_id,
            payer: payer,
            payee: invoice.seller,
            payment_nonce: payment_nonce
        };
        let payment_id: field = BHP256::hash_to_field(payment_data);

        // Receipt for payer
        let receipt: PaymentRecord = PaymentRecord {
            owner: payer,
            payment_id: payment_id,
            invoice_id: invoice.invoice_id,
            payer: payer,
            payee: invoice.seller,
            amount: invoice.amount,
            paid_at: paid_at
        };

        // Updated invoice status (private copy)
        let updated_invoice: InvoiceRecord = InvoiceRecord {
            owner: invoice.owner,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_PAID,
            order_id: invoice.order_id,
            tax_amount: invoice.tax_amount
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
        // Only expose status change
        Mapping::set(invoice_status, invoice_id, STATUS_PAID);
    }

    // Cancel invoice (seller only), finalize status change
    async transition cancel_invoice(
        invoice: InvoiceRecord
    ) -> (InvoiceRecord, Future) {
        let caller: address = self.caller;

        // Only seller can cancel
        assert_eq(caller, invoice.seller);
        // Must be pending
        assert_eq(invoice.status, STATUS_PENDING);

        let cancelled_invoice: InvoiceRecord = InvoiceRecord {
            owner: invoice.owner,
            invoice_id: invoice.invoice_id,
            seller: invoice.seller,
            buyer: invoice.buyer,
            amount: invoice.amount,
            invoice_hash: invoice.invoice_hash,
            due_date: invoice.due_date,
            created_at: invoice.created_at,
            status: STATUS_CANCELLED,
            order_id: invoice.order_id,
            tax_amount: invoice.tax_amount
        };

        return (
            cancelled_invoice,
            finalize_cancel_invoice(invoice.invoice_id)
        );
    }

    async function finalize_cancel_invoice(
        public invoice_id: field
    ) {
        Mapping::set(invoice_status, invoice_id, STATUS_CANCELLED);
    }

    // ========= Auxiliary transitions (unchanged behavior) =========

    // Verify invoice hash integrity
    transition verify_invoice(
        invoice: InvoiceRecord,
        expected_hash: field
    ) -> bool {
        return invoice.invoice_hash == expected_hash;
    }

    // Verify payment receipt matches invoice
    transition verify_payment(
        receipt: PaymentRecord,
        invoice: InvoiceRecord
    ) -> bool {
        let matches_invoice: bool = receipt.invoice_id == invoice.invoice_id;
        let matches_amount: bool = receipt.amount == invoice.amount;
        let matches_parties: bool = (receipt.payer == invoice.buyer) && (receipt.payee == invoice.seller);
        return matches_invoice && matches_amount && matches_parties;
    }

    // Seller generates receipt copy (optional)
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

    // Deterministic invoice_id helper (off-chain parity fallback)
    transition compute_invoice_id(
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

    // ========= ZK compliance proofs =========

    // Prove declared tax aligns with expected rate (basis points)
    transition prove_tax_compliance(
        private invoice: InvoiceRecord,
        public expected_tax_rate_bps: u64,
        private actual_tax_amount: u64
    ) -> bool {
        let expected_tax: u64 = invoice.amount * expected_tax_rate_bps / 10000u64;
        return actual_tax_amount == expected_tax;
    }

    // Prove invoice amount is within a public range
    transition prove_amount_in_range(
        private invoice: InvoiceRecord,
        public min_amount: u64,
        public max_amount: u64
    ) -> bool {
        let above_min: bool = invoice.amount >= min_amount;
        let below_max: bool = invoice.amount <= max_amount;
        return above_min && below_max;
    }

    // Prove caller is seller or buyer; finalize checks chain hash
    async transition prove_invoice_ownership(
        private invoice: InvoiceRecord
    ) -> (bool, Future) {
        let is_seller: bool = self.caller == invoice.seller;
        let is_buyer: bool = self.caller == invoice.buyer;
        let is_party: bool = is_seller || is_buyer;

        return (
            is_party,
            finalize_prove_ownership(invoice.invoice_id, invoice.invoice_hash)
        );
    }

    async function finalize_prove_ownership(
        public invoice_id: field,
        public claimed_hash: field
    ) {
        let chain_hash: field = Mapping::get(invoice_registry, invoice_id);
        assert_eq(chain_hash, claimed_hash);
    }

    // ========= Optional on-chain audit marker =========

    async transition submit_audit_report(
        invoice_id: field,
        audit_type: u8,
        result: bool,
        current_time: u32
    ) -> (AuditReport, Future) {
        let auditor: address = self.caller;

        let report: AuditReport = AuditReport {
            owner: auditor,
            invoice_id: invoice_id,
            audit_type: audit_type,
            result: result,
            audited_at: current_time,
            auditor: auditor
        };

        return (
            report,
            finalize_audit_report(invoice_id, auditor)
        );
    }

    async function finalize_audit_report(
        public invoice_id: field,
        public auditor: address
    ) {
        // Placeholder for potential public stats; intentionally does not expose result.
    }
}
