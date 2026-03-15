import '@picocss/pico/css/pico.min.css';
import 'tippy.js/dist/tippy.css';
import './style.css';
import eruda from 'eruda';
import erudaDom from 'eruda-dom';
import { initUI } from './ui';

eruda.init();
eruda.add(erudaDom);
initUI();
