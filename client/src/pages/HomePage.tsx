import { useEffect } from 'react';
import { Hero } from '@/components/home/Hero';
import { FeatureStrip, FootwearAccessories, HowItWorks, KidsCollection, MensCollection, RecentlyViewed, ShopByCategory, SupplierBanner, WomensCollection } from '@/components/home/Sections';
import { NewArrivals, RetailerEssentials, ShopBySupplier, TwoSidedMarketplace } from '@/components/home/MarketplaceSections';

export default function HomePage() {
  useEffect(() => {
    document.title = "Dhaaga Bazaar · India's B2B Garment Marketplace";
  }, []);
  return (
    <>
      <Hero />
      <FeatureStrip />
      <ShopByCategory />
      <RecentlyViewed />
      <NewArrivals />
      <TwoSidedMarketplace />
      <RetailerEssentials />
      <WomensCollection />
      <MensCollection />
      <KidsCollection />
      <FootwearAccessories />
      <ShopBySupplier />
      <HowItWorks />
      <SupplierBanner />
    </>
  );
}
