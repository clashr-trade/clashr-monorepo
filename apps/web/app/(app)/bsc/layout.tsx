/** CSP nonces are per request; none of the BSC wallet routes may use static bootstrap HTML. */
export const dynamic = 'force-dynamic';
export default function BscLayout({children}:{children:React.ReactNode}) { return children; }
