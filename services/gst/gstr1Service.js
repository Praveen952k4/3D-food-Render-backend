const GSTReturnDraft = require('../../models/gst/GSTReturnDraft');
const GSTProfileService = require('./gstProfileService');
const GSTOrderDataService = require('./gstOrderDataService');
const GSTTaxCalculationService = require('./gstTaxCalculationService');
const GSTAuditService = require('./gstAuditService');

class GSTR1Service {
  /**
   * Generate or regenerate GSTR-1 draft for a reporting period
   */
  static async generateDraft(restaurantId = 'default_restaurant', period, actor) {
    const profile = await GSTProfileService.getProfile(restaurantId);

    // Rule: Disabled for unregistered restaurants
    if (!profile.isGstRegistered) {
      throw new Error('GSTR-1 generation is disabled: The restaurant is configured as GST Unregistered.');
    }

    // Step 1: Fetch or calculate snapshot
    let snapshot = await GSTOrderDataService.getSnapshot(restaurantId, period);
    if (!snapshot) {
      snapshot = await GSTOrderDataService.calculatePeriodSnapshot(restaurantId, period, actor);
    }

    // Increment version if a draft already exists for this period
    const existingDraft = await GSTReturnDraft.findOne({
      restaurantId,
      returnType: 'GSTR-1',
      period,
    }).sort({ version: -1 });

    const nextVersion = existingDraft ? existingDraft.version + 1 : 1;

    // Step 2: Build GSTR-1 GSTN structure
    // B2CS (B2C Small) table: Intrastate supplies to unregistered consumers
    const b2csTable = [{
      sply_ty: 'INTRA',
      pos: profile.stateCode,
      typ: 'OE', // Other than E-commerce
      rt: profile.taxTreatment === '18_percent_with_itc' ? 18.0 : 5.0,
      txval: snapshot.taxableTurnover,
      camt: snapshot.cgst,
      samt: snapshot.sgst,
      iamt: snapshot.igst,
      csamt: 0,
    }];

    // HSN Summary table
    const hsnTable = snapshot.categoryBreakdown.map((item, idx) => ({
      num: idx + 1,
      hsn_sc: item.hsnCode || '996331',
      desc: item.category + ' Services',
      uqc: 'OTH',
      qty: item.count,
      val: item.taxableAmount + item.taxAmount,
      txval: item.taxableAmount,
      iamt: 0,
      camt: GSTTaxCalculationService.round2(item.taxAmount / 2),
      samt: GSTTaxCalculationService.round2(item.taxAmount / 2),
      csamt: 0,
    }));

    // Document Issue table
    const docIssueTable = [{
      doc_num: 1,
      doc_typ: 'Invoices for outward supply',
      from: `${profile.invoiceSeriesPrefix}-${period.replace('-', '')}-0001`,
      to: `${profile.invoiceSeriesPrefix}-${period.replace('-', '')}-${String(snapshot.totalEligibleOrders).padStart(4, '0')}`,
      totnum: snapshot.totalEligibleOrders,
      canc: 0,
      net_issue: snapshot.totalEligibleOrders,
    }];

    const payload = {
      gstin: profile.gstin,
      fp: period.split('-').reverse().join(''), // Format: MMYYYY (e.g. 102026)
      gt: snapshot.taxableTurnover,
      cur_gt: snapshot.taxableTurnover,
      b2cs: b2csTable,
      hsn: { data: hsnTable },
      doc_issue: { doc_det: [{ doc_num: 1, docs: docIssueTable }] },
    };

    // Step 3: Run Validation Checks
    const validationErrors = [];
    if (!profile.gstin || profile.gstin.length !== 15) {
      validationErrors.push({
        code: 'VAL_GSTIN_INVALID',
        field: 'gstin',
        message: 'Invalid or missing GSTIN in profile.',
        severity: 'error',
      });
    }

    if (snapshot.taxableTurnover <= 0) {
      validationErrors.push({
        code: 'VAL_ZERO_SALES',
        field: 'taxableTurnover',
        message: 'No eligible sales recorded for this period. A Nil return will be prepared.',
        severity: 'warning',
      });
    }

    if (snapshot.taxableTurnover < 0) {
      validationErrors.push({
        code: 'VAL_NEGATIVE_TURNOVER',
        field: 'taxableTurnover',
        message: 'Taxable turnover cannot be negative.',
        severity: 'error',
      });
    }

    const hasErrors = validationErrors.some(v => v.severity === 'error');
    const status = hasErrors ? 'draft' : 'ready_for_review';

    const draft = new GSTReturnDraft({
      restaurantId,
      returnType: 'GSTR-1',
      period,
      financialYear: snapshot.financialYear,
      version: nextVersion,
      status,
      validationErrors,
      taxableAmount: snapshot.taxableTurnover,
      cgstAmount: snapshot.cgst,
      sgstAmount: snapshot.sgst,
      igstAmount: snapshot.igst,
      totalTaxAmount: snapshot.totalOutputTax,
      eligibleItcAmount: 0,
      netPayableAmount: snapshot.totalOutputTax,
      payload,
      snapshotId: snapshot._id,
    });

    await draft.save();

    await GSTAuditService.logEvent({
      restaurantId,
      action: 'GSTR1_DRAFT_GENERATED',
      actor,
      details: {
        period,
        version: nextVersion,
        status,
        taxableAmount: draft.taxableAmount,
        totalTaxAmount: draft.totalTaxAmount,
      }
    });

    return draft;
  }

  /**
   * Approve GSTR-1 draft
   */
  static async approveDraft(restaurantId = 'default_restaurant', draftId, actor, approvalNotes = '') {
    const draft = await GSTReturnDraft.findOne({ _id: draftId, restaurantId });
    if (!draft) throw new Error('Return draft not found');

    if (draft.validationErrors.some(e => e.severity === 'error')) {
      throw new Error('Cannot approve GSTR-1 draft with unresolved validation errors');
    }

    draft.status = 'approved';
    draft.approvedBy = actor?.id || actor?.userId;
    draft.approvedAt = new Date();
    draft.approvalNotes = approvalNotes;

    await draft.save();

    await GSTAuditService.logEvent({
      restaurantId,
      action: 'GSTR1_DRAFT_APPROVED',
      actor,
      details: {
        draftId: draft._id,
        version: draft.version,
        period: draft.period,
      }
    });

    return draft;
  }
}

module.exports = GSTR1Service;
