export const SEGMENTS = {
  mailable: { label:'Send list', note:'Confirmed deliverable, plus role addresses that carry no other risk.',
    filter:'or=(status.eq.safe,and(status.eq.risky,role_account.is.true,catch_all.is.false,disposable.is.false,full_inbox.is.false))' },
  deliverable: { label:'Confirmed, no role', note:'Confirmed deliverable with info@, hello@ and similar removed.',
    filter:'status=eq.safe&role_account=is.false' },
  safe_all: { label:'Confirmed', note:'Everything the mail server confirmed, role addresses included.',
    filter:'status=eq.safe' },
  role: { label:'Role addresses', note:'info@, support@, contact@ and the like.',
    filter:'role_account=is.true' },
  catch_all: { label:'Catch-all', note:'The domain accepts anything, so the mailbox cannot be confirmed either way.',
    filter:'catch_all=is.true' },
  unresolved: { label:'No answer', note:'The mail server would not say. Worth a second pass or a paid check.',
    filter:'status=in.(unknown,error)' },
  invalid: { label:'Suppress', note:'Confirmed undeliverable. Feed this back into your sending platform.',
    filter:'status=eq.invalid' },
  disposable: { label:'Disposable', note:'Throwaway inbox providers.',
    filter:'disposable=is.true' },
  risky_all: {
    label: 'Risky',
    note: 'Accepted, but with a flag against it — role, catch-all, disposable or full.',
    filter: 'status=eq.risky',
  },
  discarded: {
    label: 'Everything excluded',
    note: 'The inverse of the send list. Every address the rule left out, in one file.',
    filter:
      'not.or=(status.eq.safe,and(status.eq.risky,role_account.is.true,catch_all.is.false,disposable.is.false,full_inbox.is.false))',
  },
  error: {
    label: 'Failed checks',
    note: 'The verifier itself errored. Worth re-running before you judge these.',
    filter: 'status=eq.error',
  },
  full_inbox: { label:'Full inbox', note:'Real address, but the mailbox is over quota.',
    filter:'full_inbox=is.true' },
};
export const SEGMENT_ORDER = ['mailable','deliverable','safe_all','role','risky_all','catch_all','unresolved','invalid','disposable','full_inbox','error','discarded'];
