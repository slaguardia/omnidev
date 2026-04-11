'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Select, SelectItem } from '@heroui/select';
import { docsConfig } from '@/lib/docs/config';

export function MobileDocsNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  // Get current slug from pathname
  const currentSlug = pathname.replace('/docs/', '');

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const slug = e.target.value;
    if (slug) {
      router.push(`/docs/${slug}`);
    }
  };

  return (
    <div className="lg:hidden mb-6">
      <Select
        label="Navigate to"
        labelPlacement="outside"
        selectedKeys={currentSlug ? [currentSlug] : []}
        onChange={handleChange}
        classNames={{
          trigger: 'bg-content2/60',
        }}
      >
        {docsConfig.flatMap((section) =>
          section.pages.map((page) => (
            <SelectItem key={page.slug} textValue={page.title}>
              <div className="flex flex-col">
                <span>{page.title}</span>
                <span className="text-xs text-default-400">{section.title}</span>
              </div>
            </SelectItem>
          ))
        )}
      </Select>
    </div>
  );
}
