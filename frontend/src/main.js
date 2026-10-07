import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import es from 'element-plus/es/locale/lang/es';
import 'element-plus/dist/index.css';
import './style.css';
import App from './App.vue';
createApp(App).use(ElementPlus,{locale:es}).mount('#app');
