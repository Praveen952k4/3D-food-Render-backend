const GSTReturnDraft = require('../../models/gst/GSTReturnDraft');
const GSTProfileService = require('./gstProfileService');
const GSTOrderDataService = require('./gstOrderDataService');
const GSTReconciliationService = require('./gstReconciliationService');
const GSTTaxCalculationService = require('./gstTaxCalculationService');
const GSTAuditService = require('./gstAuditService');

class GSTR3BService {
  /**
   * Generate or regenerate GSTR-3B draft for a reporting period
   */
  static async generateDraft(restaurantId = 'default_restaurant', period, actor) {
    const profile = await GSTProfileService.getProfile(restaurantId);

    if (!profile.isGstRegistered) {
      throw new Error('GSTR-3B generation is disabled: The restaurant is configured as GST Unregistered.');
    }

    // Step 1: Get sales snapshot
    let snapshot = await GSTOrderDataService.getSnapshot(restaurantId, period);
    if (!snapshot) {
      snapshot = await GSTOrderDataService.calculatePeriodSnapshot(restaurantId, period, actor);
    }

    // Step 2: Get reconciliation summary for ITC & inward supplies
    const reconSummary = await GSTReconciliationService.getReconciliationSummary(restaurantId, period, snapshot);

    // Increment version if a draft already exists
    const existingDraft = await GSTReturnDraft.findOne({
      restaurantId,
      returnType: 'GSTR-3B',
      period,
    }).sort({ version: -1 });

    const nextVersion = existingDraft ? existingDraft.version + 1 : 1;

    // Step 3: Build GSTR-3B GSTN structure
    // Table 3.1: Outward Supplies
    const table3_1 = {
      osup_det: {
        txval: snapshot.taxableTurnover,
        iamt: snapshot.igst,
        camt: snapshot.cgst,
        samt: snapshot.sgst,
        csamt: 0,
      },
      osup_zero: { txval: 0, iamt: 0, csamt: 0 },
      osup_nil_exmp: { txval: 0 },
      isup_rev: { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 },
      osup_nongst: { txval: 0 },
    };

    // Table 4: Eligible ITC
    const halfItc = GSTTaxCalculationService.round2(reconSummary.eligibleItc / 2);
    const table4 = {
      itc_avl: [
        {
          ty: 'OTH', // All other ITC
          iamt: 0,
          camt: profile.itcEligible ? halfItc : 0,
          samt: profile.itcEligible ? halfItc : 0,
          csamt: 0,
        }
      ],
      itc_rev: [],
      itc_net: {
        iamt: 0,
        camt: profile.itcEligible ? halfItc : 0,
        samt: profile.itcEligible ? halfItc : 0,
        csamt: 0,
      },
      itc_inel: [
        {
          ty: 'RUL', // Blocked under Sec 17(5)
          iamt: 0,
          camt: GSTTaxCalculationService.round2(reconSummary.blockedItc / 2),
          samt: GSTTaxCalculationService.round2(reconSummary.blockedItc / 2),
          csamt: 0,
        }
      ]
    };

    // Table 6.1: Net Tax Payable
    const netCgstPaise = Math.max(0, GSTTaxCalculationService.toPaise(snapshot.cgst) - (profile.itcEligible ? GSTTaxCalculationService.toPaise(halfItc) : 0));
    const netSgstPaise = Math.max(0, GSTTaxCalculationService.toPaise(snapshot.sgst) - (profile.itcEligible ? GSTTaxCalculationService.toPaise(halfItc) : 0));
    const netPayable = GSTTaxCalculationService.toRupees(netCgstPaise + netSgstPaise);

    const payload = {
      gstin: profile.gstin,
      ret_period: period.split('-').reverse().join(''), // MMYYYY
      sup_details: table3_1,
      itc_elg: table4,
      tax_pmt: {
        net_payable: netPayable,
        cgst_payable: GSTTaxCalculationService.toRupees(netCgstPaise),
        sgst_payable: GSTTaxCalculationService.toRupees(netSgstPaise),
        igst_payable: 0,
      }
    };

    // Step 4: Run Validation Checks
    const validationErrors = [];
    if (!profile.gstin || profile.gstin.length !== 15) {
      validationErrors.push({
        code: 'VAL_GSTIN_INVALID',
        field: 'gstin',
        message: 'Invalid or missing GSTIN in profile.',
        severity: 'error',
      });
    }

    if (reconSummary.unresolvedIssues.length > 0) {
      validationErrors.push({
        code: 'VAL_RECON_ISSUES',
        field: 'reconciliation',
        message: reconSummary.unresolvedIssues.join(' '),
        severity: 'warning',
      });
    }

    // Cross-check against GSTR-1
    const gstr1 = await GSTReturnDraft.findOne({
      restaurantId,
      returnType: 'GSTR-1',
      period,
    }).sort({ version: -1 });

    if (gstr1 && Math.abs(gstr1.taxableAmount - snapshot.taxableTurnover) > 1.0) {
      validationErrors.push({
        code: 'VAL_GSTR1_MISMATCH',
        field: 'taxableAmount',
        message: `GSTR-3B taxable turnover (₹${snapshot.taxableTurnover}) differs from GSTR-1 draft (₹${gstr1.taxableAmount}).`,
        severity: 'warning',
      });
    }

    const hasErrors = validationErrors.some(v => v.severity === 'error');
    const status = hasErrors ? 'draft' : 'ready_for_review';

    const draft = new GSTReturnDraft({
      restaurantId,
      returnType: 'GSTR-3B',
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
      eligibleItcAmount: profile.itcEligible ? reconSummary.eligibleItc : 0,
      netPayableAmount: netPayable,
      payload,
      snapshotId: snapshot._id,
    });

    await draft.save();

    await GSTAuditService.logEvent({
      restaurantId,
      action: 'GSTR3B_DRAFT_GENERATED',
      actor,
      details: {
        period,
        version: nextVersion,
        status,
        taxableAmount: draft.taxableAmount,
        netPayableAmount: draft.netPayableAmount,
      }
    });

    return draft;
  }

  /**
   * Approve GSTR-3B draft
   */
  static async approveDraft(restaurantId = 'default_restaurant', draftId, actor, approvalNotes = '') {
    const draft = await GSTReturnDraft.findOne({ _id: draftId, restaurantId });
    if (!draft) throw new Error('Return draft not found');

    if (draft.validationErrors.some(e => e.severity === 'error')) {
      throw new Error('Cannot approve GSTR-3B draft with unresolved validation errors');
    }

    draft.status = 'approved';
    draft.approvedBy = actor?.id || actor?.userId;
    draft.approvedAt = new Date();
    draft.approvalNotes = approvalNotes;

    await draft.save();

    await GSTAuditService.logEvent({
      restaurantId,
      action: 'GSTR3B_DRAFT_APPROVED',
      actor,
      details: {
        draftId: draft._id,
        version: draft.version,
        period: draft.period,
        netPayableAmount: draft.netPayableAmount,
      }
    });

    return draft;
  }
}

module.exports = GSTR3BService;
