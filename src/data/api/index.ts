import {LocalApi} from './local';
import {HttpApi} from './http';
export type {Api} from './types';
export const dataSource: 'http'|'local'=document.documentElement.dataset.signedin==='true'?'http':'local';
export const api=dataSource==='http'?new HttpApi('/api/studio'):new LocalApi();
