import { create } from 'zustand';

type CompanyStore = {
  activeCompanyId?: string;
  setActiveCompany: (id: string) => void;
};

export const useCompanyStore = create<CompanyStore>((set) => ({
  activeCompanyId: undefined,
  setActiveCompany: (id) => set({ activeCompanyId: id })
}));
