// frontend/src/components/DevBanner.tsx
export default function DevBanner() {
  if (process.env.NEXT_PUBLIC_USE_MOCKS !== "1") {
    return null;
  }

  return (
    <div className="bg-amber-500 text-black text-center py-1 text-sm font-bold w-full fixed top-0 z-50">
      ⚠️ MOCK MODE ACTIVE ⚠️ - Application is rendering from mock data. Set NEXT_PUBLIC_USE_MOCKS=0 to connect to backend.
    </div>
  );
}
